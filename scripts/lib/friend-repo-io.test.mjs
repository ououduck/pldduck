import { describe, it, expect } from 'vitest';
import { createRepoClient, TARGET_BRANCH } from './friend-repo-io.mjs';

const TOKEN = 'ghp_secret_token_should_never_leak';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
  body: { cancel: async () => {} },
});

const encode = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');

/** 记录每次调用的假 fetch：routes 是「方法 + 路径片段 → 响应队列」，队列空时回落到最后一个元素。 */
const makeFetch = (routes) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const key = `${method} ${url.replace(/^https:\/\/api\.github\.com/, '')}`;
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const queue = routes[Object.keys(routes).find((pattern) => key.includes(pattern))] || [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error(`未预置的调用：${key}`);
    return next;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

const client = (fetchImpl, extra = {}) =>
  createRepoClient({
    token: TOKEN,
    owner: 'ououduck',
    repo: 'pldduck',
    fetchImpl,
    ...extra,
  });

describe('friend-repo-io · request', () => {
  it('缺 token 时直接抛错，不发请求', async () => {
    const fetchImpl = makeFetch({});
    await expect(client(fetchImpl, { token: '' }).request('GET', '/x')).rejects.toThrow(/GITHUB_TOKEN/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('404 + allow404 返回 null；不带 allow404 时抛错且错误信息不含 token', async () => {
    const fetchImpl = makeFetch({ 'GET /missing': [jsonResponse(404, { message: 'Not Found' })] });
    expect(await client(fetchImpl).request('GET', '/missing', { allow404: true })).toBeNull();

    const fetchImpl2 = makeFetch({ 'GET /missing': [jsonResponse(404, { message: 'Not Found' })] });
    const error = await client(fetchImpl2)
      .request('GET', '/missing')
      .catch((e) => e);
    expect(error.status).toBe(404);
    expect(error.message).not.toContain(TOKEN);
  });

  it('token 只出现在 Authorization 头', async () => {
    const fetchImpl = makeFetch({ 'GET /ok': [jsonResponse(200, { ok: 1 })] });
    await client(fetchImpl).request('GET', '/ok');
    expect(fetchImpl.calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('friend-repo-io · readRepoFile', () => {
  it('解 base64 并带回落 sha；不存在时返回 null', async () => {
    const fetchImpl = makeFetch({
      'GET /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(200, { sha: 'sha-1', content: encode({ name: 'A' }) }),
      ],
    });
    expect(await client(fetchImpl).readRepoFile('friends/a.json')).toEqual({ sha: 'sha-1', content: '{"name":"A"}' });
    expect(fetchImpl.calls[0].url).toContain(`?ref=${TARGET_BRANCH}`);
  });

  it('目录（数组响应）按不存在处理', async () => {
    const fetchImpl = makeFetch({ 'GET /repos/ououduck/pldduck/contents/friends': [jsonResponse(200, [])] });
    expect(await client(fetchImpl).readRepoFile('friends')).toBeNull();
  });

  it('owner/repo 缺失时拒绝拼 URL 发请求', async () => {
    const fetchImpl = makeFetch({});
    const c = createRepoClient({ token: TOKEN, owner: '', repo: '', fetchImpl });
    await expect(c.readRepoFile('friends/a.json')).rejects.toThrow(/GITHUB_REPOSITORY/);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe('friend-repo-io · writeRepoFile', () => {
  const put = (overrides = {}) => ({
    filePath: 'friends/a.json',
    content: '{"name":"A"}',
    message: 'chore: test',
    sha: 'sha-1',
    ...overrides,
  });

  it('正常写入：PUT 带 branch/sha/base64 正文', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [jsonResponse(200, { commit: { sha: 'c1' } })],
    });
    const written = await client(fetchImpl).writeRepoFile(put());
    expect(written.commit.sha).toBe('c1');
    const body = fetchImpl.calls[0].body;
    expect(body).toEqual({
      message: 'chore: test',
      content: Buffer.from('{"name":"A"}', 'utf8').toString('base64'),
      branch: TARGET_BRANCH,
      sha: 'sha-1',
    });
  });

  it('409 后复读：assertSame 认得同一条记录才带新 sha 重试一次', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(409, { message: 'sha was supposed to be sha-1 but is sha-9' }),
        jsonResponse(200, { commit: { sha: 'c2' } }),
      ],
      'GET /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(200, { sha: 'sha-9', content: encode({ url: 'https://blog.example' }) }),
      ],
    });
    const written = await client(fetchImpl).writeRepoFile(
      put({ assertSame: (record) => record.url === 'https://blog.example' }),
    );
    expect(written.commit.sha).toBe('c2');
    const puts = fetchImpl.calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts[1].body.sha).toBe('sha-9');
  });

  it('冲突文件已被改成另一条记录 → 硬失败，绝不覆盖', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(409, { message: 'sha was supposed to be sha-1 but is sha-9' }),
      ],
      'GET /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(200, { sha: 'sha-9', content: encode({ url: 'https://other.example' }) }),
      ],
    });
    const error = await client(fetchImpl)
      .writeRepoFile(put({ assertSame: (record) => record.url === 'https://blog.example' }))
      .catch((e) => e);
    expect(error.message).toContain('为避免覆盖请人工处理');
    expect(fetchImpl.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('冲突后复读失败（404）→ 抛原始 409', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [jsonResponse(409, { message: 'sha was supposed to be' })],
      'GET /repos/ououduck/pldduck/contents/friends/a.json': [jsonResponse(404, { message: 'Not Found' })],
    });
    const error = await client(fetchImpl)
      .writeRepoFile(put({ assertSame: () => true }))
      .catch((e) => e);
    expect(error.status).toBe(409);
  });

  it('第二次仍冲突 → 不再重试', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(409, { message: 'sha was supposed to be' }),
        jsonResponse(409, { message: 'sha was supposed to be' }),
      ],
      'GET /repos/ououduck/pldduck/contents/friends/a.json': [
        jsonResponse(200, { sha: 'sha-9', content: encode({ url: 'https://blog.example' }) }),
      ],
    });
    const error = await client(fetchImpl)
      .writeRepoFile(put({ assertSame: (r) => r.url === 'https://blog.example' }))
      .catch((e) => e);
    expect(error.status).toBe(409);
    expect(fetchImpl.calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
  });

  it('不给 assertSame 就不重试（新文件之外的写入必须显式认领）', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [jsonResponse(409, { message: 'sha was supposed to be' })],
    });
    const error = await client(fetchImpl)
      .writeRepoFile(put())
      .catch((e) => e);
    expect(error.status).toBe(409);
    expect(fetchImpl.calls.filter((c) => c.method === 'GET')).toHaveLength(0);
  });

  it('非冲突错误（422）立即抛出', async () => {
    const fetchImpl = makeFetch({
      'PUT /repos/ououduck/pldduck/contents/friends/a.json': [jsonResponse(422, { message: 'Validation Failed' })],
    });
    const error = await client(fetchImpl)
      .writeRepoFile(put({ assertSame: () => true }))
      .catch((e) => e);
    expect(error.status).toBe(422);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});

describe('friend-repo-io · dispatchWorkflow', () => {
  it('按 deploy.yml 守卫形状给 ref 与 payload', async () => {
    const fetchImpl = makeFetch({
      'POST /repos/ououduck/pldduck/actions/workflows/deploy.yml/dispatches': [jsonResponse(204, {})],
    });
    await client(fetchImpl).dispatchWorkflow('deploy.yml');
    const { url, body } = fetchImpl.calls[0];
    expect(url).toContain('/workflows/deploy.yml/dispatches');
    expect(body.ref).toBe(TARGET_BRANCH);
    expect(JSON.parse(body.inputs.payload)).toEqual({ repository: { ref: TARGET_BRANCH } });
  });
});
