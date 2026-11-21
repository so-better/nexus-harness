/**
 * Markdown 渲染：Marked + KaTeX + highlight.js + DOMPurify。
 */

import DOMPurify from 'dompurify';
import { Marked, type RendererObject, type Tokens } from 'marked';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';
import 'katex/dist/katex.min.css';
import { t } from '@/app/i18n';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let mathOutput: string[] = [];

/**
 * KaTeX 输出保留内联尺寸样式，因此先放占位符，消毒后再替换为可信的公式 HTML。
 */
const mathPlaceholder = (html: string, block = false): string => {
  const key = String(mathOutput.length);
  mathOutput.push(html);
  return block ? `<div data-nh-math="${key}"></div>` : `<span data-nh-math="${key}"></span>`;
};

const inlineMath = {
  name: 'inlineMath',
  level: 'inline' as const,
  start(src: string) {
    return src.match(/\$(?!\s)(?=[^$\n]*[^\s$]\$)/)?.index;
  },
  tokenizer(src: string) {
    const match = /^\$(?!\s)([^$\n]*?[^\s$])\$/.exec(src);
    if (match) return { type: 'inlineMath', raw: match[0], text: match[1] };
    return undefined;
  },
  renderer(token: { text: string; raw: string }) {
    try {
      return mathPlaceholder(katex.renderToString(token.text, { throwOnError: false }));
    } catch {
      return escapeHtml(token.raw);
    }
  }
};

const blockMath = {
  name: 'blockMath',
  level: 'block' as const,
  start(src: string) {
    return src.match(/^\$\$/)?.index;
  },
  tokenizer(src: string) {
    const match = /^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src);
    if (match) return { type: 'blockMath', raw: match[0], text: match[1] };
    return undefined;
  },
  renderer(token: { text: string; raw: string }) {
    try {
      return mathPlaceholder(
        katex.renderToString(token.text, { throwOnError: false, displayMode: true }),
        true
      );
    } catch {
      return escapeHtml(token.raw);
    }
  }
};

const codeRenderer: RendererObject['code'] = ({ text, lang }: Tokens.Code) => {
  const language = (lang ?? '').trim().split(/\s+/)[0] ?? '';
  const highlighted =
    language && hljs.getLanguage(language)
      ? hljs.highlight(text, { language }).value
      : hljs.highlightAuto(text).value;
  const langHtml = language
    ? `<span class="md-code-lang">${escapeHtml(language)}</span>`
    : '<span class="md-code-lang"></span>';
  const classAttr = language ? ` class="hljs language-${escapeHtml(language)}"` : ' class="hljs"';
  return `<div class="md-code-block"><div class="md-code-head">${langHtml}<button type="button" class="md-code-copy">${t('chat.copy')}</button></div><pre><code${classAttr}>${highlighted}</code></pre></div>`;
};

const marked = new Marked({ gfm: true, breaks: true });

/**
 * GFM 自动链接会在 JSON 字符串里把结尾引号也吞进 URL；
 * 这里在引号、尖括号和反引号处截断，保留后续原文为普通文本。
 */
const cleanAutolink = {
  name: 'cleanAutolink',
  level: 'inline' as const,
  start(src: string) {
    return src.match(/https?:\/\//)?.index;
  },
  tokenizer(src: string) {
    const match = /^https?:\/\/[^\s"'`<>]+/.exec(src);
    if (!match) return undefined;
    const href = match[0].replace(/[.,;:!?]+$/, '');
    if (!href) return undefined;
    return {
      type: 'link',
      raw: href,
      href,
      text: href,
      autolink: true,
      tokens: [{ type: 'text', raw: href, text: href }]
    };
  }
};

marked.use({ renderer: { code: codeRenderer } });
marked.use({ extensions: [blockMath, inlineMath, cleanAutolink] });

/**
 * 将模型输出渲染为安全 HTML。
 */
export const renderMarkdown = (content: string): string => {
  mathOutput = [];
  try {
    const html = DOMPurify.sanitize(marked.parse(content) as string, {
      USE_PROFILES: { html: true, mathMl: true },
      ADD_ATTR: [
        'class',
        'encoding',
        'xmlns',
        'data-nh-math',
        'controls',
        'poster',
        'preload',
        'playsinline',
        'muted',
        'loop',
        'width',
        'height'
      ],
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'object', 'embed', 'link', 'meta'],
      FORBID_ATTR: ['style']
    });
    return mathOutput.reduce((output, formula, index) => {
      const span = `<span data-nh-math="${index}"></span>`;
      const block = `<div data-nh-math="${index}"></div>`;
      return output.replace(span, () => formula).replace(block, () => formula);
    }, html);
  } catch {
    return DOMPurify.sanitize(content, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'object', 'embed', 'link', 'meta'],
      FORBID_ATTR: ['style']
    });
  }
};
