/**
 * 受控网络：域名白名单匹配。
 */
import { describe, expect, it } from 'vitest';
import { isHostAllowed } from './plugin-net';

describe('isHostAllowed', () => {
  it('matches exact hosts', () => {
    expect(isHostAllowed('api.github.com', ['api.github.com'])).toBe(true);
    expect(isHostAllowed('API.GitHub.com', ['api.github.com'])).toBe(true);
  });

  it('matches wildcard subdomains', () => {
    expect(isHostAllowed('api.example.com', ['*.example.com'])).toBe(true);
    expect(isHostAllowed('a.b.example.com', ['*.example.com'])).toBe(true);
    expect(isHostAllowed('example.com', ['*.example.com'])).toBe(false);
  });

  it('rejects hosts outside the allowlist', () => {
    expect(isHostAllowed('evil.com', ['api.github.com', '*.example.com'])).toBe(false);
    expect(isHostAllowed('example.com.evil.com', ['*.example.com'])).toBe(false);
    expect(isHostAllowed('x.com', [])).toBe(false);
  });
});
