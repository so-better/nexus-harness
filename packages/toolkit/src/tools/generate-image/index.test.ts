/**
 * 图像生成测试：模板 body、同步结果与异步任务轮询。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateImages } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateImages', () => {
  it('renders the template and reads a direct JSON result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from('png').toString('base64') }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateImages({
      template: {
        url: 'https://example.com/v1/images/generations',
        body: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          size: '{{size}}',
          images: '{{image_urls}}'
        },
        result: { paths: ['data.0.url', 'data.0.b64_json'], encoding: 'base64' }
      },
      model: 'image-model',
      prompt: 'cat',
      count: 1
    });

    expect(images[0]?.buffer.toString()).toBe('png');
    const request = fetchMock.mock.calls[0];
    const body = JSON.parse((request?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({ model: 'image-model', prompt: 'cat' });
  });

  it('keeps reference images when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateImages({
      template: {
        url: 'https://example.com/generate',
        body: { model: '{{model}}', prompt: '{{prompt}}', images: '{{image_urls}}' },
        result: { path: 'data.0.b64_json', encoding: 'base64' }
      },
      model: 'custom-model',
      prompt: 'cat',
      count: 1,
      images: ['https://example.com/input.jpg']
    });

    const request = fetchMock.mock.calls[0];
    const body = JSON.parse((request?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body.images).toEqual(['https://example.com/input.jpg']);
  });

  it('removes optional image content when no reference image is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateImages({
      template: {
        url: 'https://example.com/generate',
        body: {
          model: '{{model}}',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '{{prompt}}' },
                { type: 'image_url', image_url: { url: '{{?image_url}}' } }
              ]
            }
          ]
        },
        result: { path: 'data.0.b64_json', encoding: 'base64' }
      },
      model: 'hy-image',
      prompt: 'cat',
      count: 1
    });

    const request = fetchMock.mock.calls[0];
    const body = JSON.parse((request?.[1] as RequestInit).body as string) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.messages[0]?.content).toEqual([{ type: 'text', text: 'cat' }]);
  });

  it('keeps optional image content when a reference image is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateImages({
      template: {
        url: 'https://example.com/generate',
        body: {
          model: '{{model}}',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '{{prompt}}' },
                { type: 'image_url', image_url: { url: '{{?image_url}}' } }
              ]
            }
          ]
        },
        result: { path: 'data.0.b64_json', encoding: 'base64' }
      },
      model: 'hy-image',
      prompt: 'cat',
      count: 1,
      images: ['https://example.com/cat.png']
    });

    const request = fetchMock.mock.calls[0];
    const body = JSON.parse((request?.[1] as RequestInit).body as string) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.messages[0]?.content).toEqual([
      { type: 'text', text: 'cat' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/cat.png' }
      }
    ]);
  });

  it('polls asynchronous image tasks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'task-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'succeeded',
            result: { b64_json: Buffer.from('async-image').toString('base64') }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateImages({
      template: {
        url: 'https://tokenhub.example.com/v1/wand/vidu-image/generation',
        body: { model: '{{model}}', prompt: '{{prompt}}' },
        poll: {
          path: 'https://tokenhub.example.com/v1/wand/vidu-image/tasks/{{id}}',
          id_path: 'id',
          status_path: 'status',
          result_path: 'result.b64_json',
          interval_ms: 500,
          timeout_ms: 5_000
        },
        result: { encoding: 'base64' }
      },
      model: 'vidu-image-q2',
      prompt: 'cat',
      count: 1
    });

    expect(images[0]?.buffer.toString()).toBe('async-image');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://tokenhub.example.com/v1/wand/vidu-image/tasks/task-1'
    );
  });
});
