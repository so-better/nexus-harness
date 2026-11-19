/**
 * PowerPoint 生成：主题与模板化版式。
 */

import PptxGenJS from 'pptxgenjs';
import { z } from 'zod';
import { assertPublicUrl } from '@nexus/runtime-utils';
import { resolveFonts } from '../../document/fonts';
import type { PptDeck, PptTheme } from '../../document/types';

export type { PptDeck, PptSlide } from '../../document/types';

type PptSlideInstance = ReturnType<PptxGenJS['addSlide']>;

const pptDeckSchema = z
  .object({
    slides: z
      .array(
        z.object({
          layout: z.enum([
            'section',
            'bullets',
            'twoColumn',
            'imageText',
            'chart',
            'table',
            'kpi',
            'quote',
            'timeline',
            'agenda',
            'comparison',
            'team',
            'gallery',
            'process',
            'end'
          ]),
          title: z.string(),
          subtitle: z.string().optional(),
          items: z.array(z.string()).optional(),
          left: z.array(z.string()).optional(),
          right: z.array(z.string()).optional(),
          text: z.array(z.string()).optional(),
          image: z.string().optional(),
          imageSide: z.enum(['left', 'right']).optional(),
          chart: z
            .object({
              type: z.enum(['bar', 'line', 'area', 'pie', 'doughnut', 'radar']),
              categories: z.array(z.string()),
              series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1)
            })
            .optional(),
          table: z
            .object({
              headers: z.array(z.string()),
              rows: z.array(z.array(z.string()))
            })
            .optional(),
          kpis: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
          quote: z.object({ text: z.string(), author: z.string().optional() }).optional(),
          steps: z
            .array(z.object({ title: z.string(), description: z.string().optional() }))
            .optional(),
          comparison: z
            .object({
              left: z.object({ title: z.string(), items: z.array(z.string()) }),
              right: z.object({ title: z.string(), items: z.array(z.string()) })
            })
            .optional(),
          team: z
            .array(
              z.object({
                name: z.string(),
                role: z.string().optional(),
                avatar: z.string().optional()
              })
            )
            .optional(),
          gallery: z
            .array(z.object({ image: z.string(), caption: z.string().optional() }))
            .optional(),
          notes: z.string().optional()
        })
      )
      .min(1)
      .max(100),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    author: z.string().optional(),
    theme: z.enum(['blue', 'dark', 'green', 'warm']).optional(),
    footer: z.string().optional(),
    showPageNo: z.boolean().optional(),
    logo: z.string().optional(),
    platform: z.string().optional()
  })
  .passthrough();

const PPT_THEMES: Record<string, PptTheme> = {
  blue: {
    accent: '00AEEF',
    text: '1F2937',
    coverBg: '0F172A',
    coverText: 'FFFFFF',
    pageBg: 'FFFFFF',
    footer: '9CA3AF'
  },
  dark: {
    accent: '35BDF5',
    text: 'E5E7EB',
    coverBg: '0B0B0F',
    coverText: 'FFFFFF',
    pageBg: '111318',
    footer: '6B7280'
  },
  green: {
    accent: '10B981',
    text: '1F2937',
    coverBg: '064E3B',
    coverText: 'FFFFFF',
    pageBg: 'FFFFFF',
    footer: '9CA3AF'
  },
  warm: {
    accent: 'F59E0B',
    text: '1F2937',
    coverBg: '7C2D12',
    coverText: 'FFFFFF',
    pageBg: 'FFFDF7',
    footer: '9CA3AF'
  }
};

/** PPT 配色主题 */
/** 幻灯片数据（模板化版式） */
/** 演示文稿数据 */
/** 16:9 画布尺寸（英寸） */
const PPT_W = 10;
const PPT_H = 5.625;
/** 内容左右边距 */
const PPT_M = 0.6;
/** 单张内嵌图片大小上限：5MB */
const PPT_IMAGE_MAX = 5 * 1024 * 1024;

/** 拉取远程图片并转为 pptxgenjs 可用的 base64（失败返回 null，不阻断生成） */
const fetchImageData = async (url: string) => {
  try {
    // 拦截内网/本机地址，避免模型可控 URL 触发 SSRF
    await assertPublicUrl(url);
    // redirect: 'error' 避免通过 30x 跳转到内网地址
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const contentLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(contentLength) && contentLength > PPT_IMAGE_MAX) return null;

    // 流式读取并在超限时立即终止，避免无 content-length 时把超大响应读入内存
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PPT_IMAGE_MAX) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) return null;
    return `${type.split(';')[0]};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
};

/** 生成 pptx 文件内容（主题 + 模板版式） */
const buildPptx = async (deck: PptDeck, cjk: string) => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = deck.author?.trim() || 'nexus';
  pptx.title = deck.title?.trim() || '演示文稿';

  const theme: PptTheme = PPT_THEMES[deck.theme ?? ''] ?? {
    accent: '00AEEF',
    text: '1F2937',
    coverBg: '0F172A',
    coverText: 'FFFFFF',
    pageBg: 'FFFFFF',
    footer: '9CA3AF'
  };
  const font = { fontFace: cjk };
  const logoData = deck.logo?.trim() ? await fetchImageData(deck.logo.trim()) : null;
  let pageNo = 0;

  /** 内容页装饰：页脚文字、logo、页码 */
  const decorate = (slide: PptSlideInstance) => {
    if (deck.footer?.trim()) {
      slide.addText(deck.footer.trim(), {
        ...font,
        x: PPT_M,
        y: PPT_H - 0.46,
        w: PPT_W - 2 * PPT_M - 0.9,
        h: 0.3,
        fontSize: 9,
        color: theme.footer,
        align: 'left'
      });
    }
    if (logoData) {
      slide.addImage({
        data: logoData,
        x: PPT_W - PPT_M - 1.0,
        y: 0.26,
        w: 1.0,
        h: 0.34,
        sizing: { type: 'contain', w: 1.0, h: 0.34 }
      });
    }
    pageNo++;
    if (deck.showPageNo !== false) {
      slide.addText(String(pageNo), {
        ...font,
        x: PPT_W - PPT_M - 0.8,
        y: PPT_H - 0.46,
        w: 0.8,
        h: 0.3,
        fontSize: 10,
        color: theme.footer,
        align: 'right'
      });
    }
  };
  /** 内容页标题 + 强调下划线 */
  const addHeader = (slide: PptSlideInstance, title: string) => {
    slide.addText(title, {
      ...font,
      x: PPT_M,
      y: 0.45,
      w: PPT_W - 2 * PPT_M,
      h: 0.7,
      fontSize: 24,
      bold: true,
      color: theme.text
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: PPT_M,
      y: 1.16,
      w: 1.2,
      h: 0.06,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 }
    });
  };
  /** 要点转带圆点的文本段 */
  const bullets = (items?: string[]) =>
    (items ?? []).map((text) => ({ text, options: { bullet: { code: '25CF' }, breakLine: true } }));
  /** 深色底居中大标题页 */
  const titlePage = (slide: PptSlideInstance, title: string, subtitle?: string) => {
    slide.background = { color: theme.coverBg };
    slide.addText(title, {
      ...font,
      x: PPT_M,
      y: 2.15,
      w: PPT_W - 2 * PPT_M,
      h: 1,
      fontSize: 30,
      bold: true,
      color: theme.coverText,
      align: 'center'
    });
    if (subtitle?.trim()) {
      slide.addText(subtitle.trim(), {
        ...font,
        x: PPT_M,
        y: 3.2,
        w: PPT_W - 2 * PPT_M,
        h: 0.7,
        fontSize: 16,
        color: theme.coverText,
        align: 'center',
        transparency: 25
      });
    }
  };

  // 封面
  const cover = pptx.addSlide();
  cover.background = { color: theme.coverBg };
  cover.addShape(pptx.ShapeType.rect, {
    x: PPT_W / 2 - 0.6,
    y: 1.5,
    w: 1.2,
    h: 0.08,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 }
  });
  cover.addText(deck.title?.trim() || '演示文稿', {
    ...font,
    x: PPT_M,
    y: 1.85,
    w: PPT_W - 2 * PPT_M,
    h: 1.2,
    fontSize: 34,
    bold: true,
    color: theme.coverText,
    align: 'center'
  });
  if (deck.subtitle?.trim()) {
    cover.addText(deck.subtitle.trim(), {
      ...font,
      x: PPT_M,
      y: 3.1,
      w: PPT_W - 2 * PPT_M,
      h: 0.7,
      fontSize: 18,
      color: theme.coverText,
      align: 'center',
      transparency: 25
    });
  }
  if (deck.author?.trim()) {
    cover.addText(deck.author.trim(), {
      ...font,
      x: PPT_M,
      y: 4.5,
      w: PPT_W - 2 * PPT_M,
      h: 0.4,
      fontSize: 12,
      color: theme.footer,
      align: 'center'
    });
  }

  for (const item of deck.slides) {
    const slide = pptx.addSlide();

    if (item.layout === 'section') {
      titlePage(slide, item.title, item.subtitle);
    } else if (item.layout === 'end') {
      titlePage(slide, item.title || '谢谢观看', item.subtitle);
    } else if (item.layout === 'twoColumn') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const colW = (PPT_W - 2 * PPT_M - 0.4) / 2;
      slide.addText(bullets(item.left), {
        ...font,
        x: PPT_M,
        y: 1.5,
        w: colW,
        h: PPT_H - 2.1,
        fontSize: 15,
        color: theme.text,
        valign: 'top',
        lineSpacingMultiple: 1.3
      });
      slide.addText(bullets(item.right), {
        ...font,
        x: PPT_M + colW + 0.4,
        y: 1.5,
        w: colW,
        h: PPT_H - 2.1,
        fontSize: 15,
        color: theme.text,
        valign: 'top',
        lineSpacingMultiple: 1.3
      });
    } else if (item.layout === 'imageText') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const imageSide = item.imageSide ?? 'right';
      const textW = 4.3;
      const gap = 0.3;
      const textX = imageSide === 'right' ? PPT_M : PPT_W - PPT_M - textW;
      // 左图时图片宽度须止于正文左侧，避免横向铺满压住文字
      const imageX = imageSide === 'right' ? PPT_M + textW + gap : PPT_M;
      const imageW = imageSide === 'right' ? PPT_W - PPT_M - imageX : textX - gap - PPT_M;
      const boxH = PPT_H - 2.1;
      slide.addText(bullets(item.text), {
        ...font,
        x: textX,
        y: 1.5,
        w: textW,
        h: boxH,
        fontSize: 15,
        color: theme.text,
        valign: 'top',
        lineSpacingMultiple: 1.3
      });
      if (item.image?.trim()) {
        const data = await fetchImageData(item.image.trim());
        if (data) {
          slide.addImage({
            data,
            x: imageX,
            y: 1.5,
            w: imageW,
            h: boxH,
            sizing: { type: 'contain', w: imageW, h: boxH }
          });
        }
      }
    } else if (item.layout === 'chart') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const chartTypes: Record<string, 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'radar'> = {
        bar: 'bar',
        line: 'line',
        area: 'area',
        pie: 'pie',
        doughnut: 'doughnut',
        radar: 'radar'
      };
      const chart = item.chart;
      if (chart?.series?.length) {
        const data = chart.series.map((series) => ({
          name: series.name,
          labels: chart.categories ?? [],
          values: series.values ?? []
        }));
        slide.addChart(chartTypes[chart.type] ?? pptx.ChartType.bar, data, {
          ...font,
          x: PPT_M,
          y: 1.45,
          w: PPT_W - 2 * PPT_M,
          h: PPT_H - 2.1,
          chartColors: [theme.accent, 'F59E0B', '10B981', '6366F1', 'EF4444', '8B5CF6'],
          showLegend: chart.series.length > 1,
          legendPos: 'b',
          catAxisLabelColor: theme.footer,
          valAxisLabelColor: theme.footer,
          dataLabelColor: theme.text,
          showPercent: chart.type === 'pie' || chart.type === 'doughnut'
        });
      }
    } else if (item.layout === 'table') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const table = item.table;
      if (table?.headers?.length) {
        const head = table.headers.map((text) => ({
          text,
          options: {
            bold: true,
            color: 'FFFFFF',
            fill: { color: theme.accent },
            valign: 'middle' as const
          }
        }));
        const body = (table.rows ?? []).map((row) =>
          row.map((text) => ({ text, options: { color: theme.text, valign: 'middle' as const } }))
        );
        slide.addTable([head, ...body], {
          x: PPT_M,
          y: 1.45,
          w: PPT_W - 2 * PPT_M,
          fontSize: 12,
          border: { type: 'solid', color: 'E5E7EB', pt: 1 },
          rowH: 0.38,
          autoPage: false,
          align: 'left'
        });
      }
    } else if (item.layout === 'kpi') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const kpis = (item.kpis ?? []).slice(0, 4);
      const gap = 0.3;
      const cardW = (PPT_W - 2 * PPT_M - gap * (kpis.length - 1)) / Math.max(kpis.length, 1);
      kpis.forEach((kpi, index) => {
        const x = PPT_M + index * (cardW + gap);
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: 1.7,
          w: cardW,
          h: 2,
          fill: { color: 'F3F4F6' },
          line: { color: 'E5E7EB', width: 0.5 },
          rectRadius: 0.08
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: x + cardW / 2 - 0.35,
          y: 1.9,
          w: 0.7,
          h: 0.05,
          fill: { color: theme.accent },
          line: { color: theme.accent, width: 0 }
        });
        slide.addText(kpi.value, {
          ...font,
          x,
          y: 2.05,
          w: cardW,
          h: 0.9,
          fontSize: 30,
          bold: true,
          color: theme.text,
          align: 'center'
        });
        slide.addText(kpi.label, {
          ...font,
          x,
          y: 2.98,
          w: cardW,
          h: 0.5,
          fontSize: 12,
          color: theme.footer,
          align: 'center'
        });
      });
    } else if (item.layout === 'quote') {
      slide.background = { color: theme.coverBg };
      slide.addText('“', {
        ...font,
        x: PPT_M,
        y: 0.85,
        w: 1.5,
        h: 1.2,
        fontSize: 72,
        bold: true,
        color: theme.accent
      });
      slide.addText(item.quote?.text ?? item.title, {
        ...font,
        x: PPT_M + 0.4,
        y: 1.7,
        w: PPT_W - 2 * PPT_M - 0.8,
        h: 2,
        fontSize: 22,
        italic: true,
        color: theme.coverText,
        align: 'center',
        valign: 'middle'
      });
      if (item.quote?.author?.trim()) {
        slide.addText(`—— ${item.quote.author.trim()}`, {
          ...font,
          x: PPT_M,
          y: 3.9,
          w: PPT_W - 2 * PPT_M,
          h: 0.4,
          fontSize: 14,
          color: theme.footer,
          align: 'center'
        });
      }
    } else if (item.layout === 'timeline') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const steps = (item.steps ?? []).slice(0, 5);
      const count = Math.max(steps.length, 1);
      const gap = 0.3;
      const nodeW = (PPT_W - 2 * PPT_M - gap * (count - 1)) / count;
      slide.addShape(pptx.ShapeType.line, {
        x: PPT_M + nodeW / 2,
        y: 2.4,
        w: PPT_W - 2 * PPT_M - nodeW,
        h: 0,
        line: { color: 'E5E7EB', width: 1.5 }
      });
      steps.forEach((step, index) => {
        const x = PPT_M + index * (nodeW + gap);
        slide.addShape(pptx.ShapeType.ellipse, {
          x: x + nodeW / 2 - 0.22,
          y: 2.18,
          w: 0.44,
          h: 0.44,
          fill: { color: theme.accent },
          line: { color: 'FFFFFF', width: 1 }
        });
        slide.addText(String(index + 1), {
          ...font,
          x: x + nodeW / 2 - 0.22,
          y: 2.18,
          w: 0.44,
          h: 0.44,
          fontSize: 14,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
          valign: 'middle'
        });
        slide.addText(step.title, {
          ...font,
          x,
          y: 2.78,
          w: nodeW,
          h: 0.5,
          fontSize: 14,
          bold: true,
          color: theme.text,
          align: 'center'
        });
        if (step.description?.trim()) {
          slide.addText(step.description.trim(), {
            ...font,
            x,
            y: 3.28,
            w: nodeW,
            h: 1,
            fontSize: 11,
            color: theme.footer,
            align: 'center',
            valign: 'top'
          });
        }
      });
    } else if (item.layout === 'agenda') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const items = (item.items ?? []).slice(0, 6);
      const rowH = Math.min(0.7, (PPT_H - 2.0) / Math.max(items.length, 1));
      items.forEach((text, index) => {
        const y = 1.55 + index * rowH;
        slide.addShape(pptx.ShapeType.roundRect, {
          x: PPT_M,
          y,
          w: 0.5,
          h: 0.5,
          fill: { color: theme.accent },
          line: { color: theme.accent, width: 0 },
          rectRadius: 0.08
        });
        slide.addText(String(index + 1).padStart(2, '0'), {
          ...font,
          x: PPT_M,
          y,
          w: 0.5,
          h: 0.5,
          fontSize: 15,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
          valign: 'middle'
        });
        slide.addText(text, {
          ...font,
          x: PPT_M + 0.75,
          y,
          w: PPT_W - 2 * PPT_M - 0.75,
          h: 0.5,
          fontSize: 16,
          color: theme.text,
          valign: 'middle'
        });
      });
    } else if (item.layout === 'comparison') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const cmp = item.comparison;
      const gap = 0.3;
      const panelW = (PPT_W - 2 * PPT_M - gap) / 2;
      const panelY = 1.5;
      const panelH = PPT_H - 2.1;
      const renderPanel = (
        x: number,
        data: { title: string; items: string[] } | undefined,
        color: string
      ) => {
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: panelY,
          w: panelW,
          h: panelH,
          fill: { color: 'F8FAFC' },
          line: { color: 'E5E7EB', width: 0.5 },
          rectRadius: 0.08
        });
        slide.addShape(pptx.ShapeType.rect, {
          x,
          y: panelY,
          w: panelW,
          h: 0.5,
          fill: { color },
          line: { color, width: 0 }
        });
        slide.addText(data?.title ?? '', {
          ...font,
          x: x + 0.15,
          y: panelY,
          w: panelW - 0.3,
          h: 0.5,
          fontSize: 15,
          bold: true,
          color: 'FFFFFF',
          valign: 'middle'
        });
        slide.addText(bullets(data?.items), {
          ...font,
          x: x + 0.2,
          y: panelY + 0.7,
          w: panelW - 0.4,
          h: panelH - 0.9,
          fontSize: 13,
          color: theme.text,
          valign: 'top',
          lineSpacingMultiple: 1.3
        });
      };
      renderPanel(PPT_M, cmp?.left, theme.accent);
      renderPanel(PPT_M + panelW + gap, cmp?.right, '94A3B8');
    } else if (item.layout === 'process') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const steps = (item.steps ?? []).slice(0, 5);
      const n = Math.max(steps.length, 1);
      const gap = 0.12;
      const nodeW = (PPT_W - 2 * PPT_M - gap * (n - 1)) / n;
      steps.forEach((step, index) => {
        const x = PPT_M + index * (nodeW + gap);
        slide.addShape(pptx.ShapeType.chevron, {
          x,
          y: 2.0,
          w: nodeW,
          h: 1.0,
          fill: { color: index % 2 ? '94A3B8' : theme.accent },
          line: { color: theme.pageBg, width: 0.5 }
        });
        slide.addText(step.title, {
          ...font,
          x,
          y: 2.0,
          w: nodeW,
          h: 1.0,
          fontSize: 13,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
          valign: 'middle'
        });
        if (step.description?.trim()) {
          slide.addText(step.description.trim(), {
            ...font,
            x,
            y: 3.15,
            w: nodeW,
            h: 1,
            fontSize: 11,
            color: theme.footer,
            align: 'center',
            valign: 'top'
          });
        }
      });
    } else if (item.layout === 'team') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const team = (item.team ?? []).slice(0, 4);
      const gap = 0.3;
      const cardW = (PPT_W - 2 * PPT_M - gap * (team.length - 1)) / Math.max(team.length, 1);
      const cardY = 1.6;
      const cardH = 2.5;
      for (let index = 0; index < team.length; index++) {
        const member = team[index];
        if (!member) continue;
        const x = PPT_M + index * (cardW + gap);
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: cardY,
          w: cardW,
          h: cardH,
          fill: { color: 'F8FAFC' },
          line: { color: 'E5E7EB', width: 0.5 },
          rectRadius: 0.08
        });
        const diameter = 1.0;
        const avatarData = member.avatar?.trim()
          ? await fetchImageData(member.avatar.trim())
          : null;
        if (avatarData) {
          slide.addImage({
            data: avatarData,
            x: x + cardW / 2 - diameter / 2,
            y: cardY + 0.3,
            w: diameter,
            h: diameter,
            rounding: true,
            sizing: { type: 'cover', w: diameter, h: diameter }
          });
        } else {
          slide.addShape(pptx.ShapeType.ellipse, {
            x: x + cardW / 2 - diameter / 2,
            y: cardY + 0.3,
            w: diameter,
            h: diameter,
            fill: { color: theme.accent },
            line: { color: theme.accent, width: 0 }
          });
        }
        slide.addText(member.name, {
          ...font,
          x,
          y: cardY + 1.45,
          w: cardW,
          h: 0.4,
          fontSize: 15,
          bold: true,
          color: theme.text,
          align: 'center'
        });
        if (member.role?.trim()) {
          slide.addText(member.role.trim(), {
            ...font,
            x,
            y: cardY + 1.85,
            w: cardW,
            h: 0.4,
            fontSize: 12,
            color: theme.footer,
            align: 'center'
          });
        }
      }
    } else if (item.layout === 'gallery') {
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      const gallery = (item.gallery ?? []).slice(0, 4);
      const cols = gallery.length <= 1 ? 1 : 2;
      const rows = Math.ceil(gallery.length / cols);
      const gap = 0.25;
      const captionH = 0.3;
      const cellW = (PPT_W - 2 * PPT_M - gap * (cols - 1)) / cols;
      const cellH = (PPT_H - 2.0 - gap * (rows - 1)) / Math.max(rows, 1);
      for (let index = 0; index < gallery.length; index++) {
        const picture = gallery[index];
        if (!picture) continue;
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = PPT_M + col * (cellW + gap);
        const imageH = cellH - (picture.caption ? captionH : 0);
        const y = 1.5 + row * (cellH + gap);
        const data = picture.image?.trim() ? await fetchImageData(picture.image.trim()) : null;
        if (data) {
          slide.addImage({
            data,
            x,
            y,
            w: cellW,
            h: imageH,
            sizing: { type: 'cover', w: cellW, h: imageH }
          });
        } else {
          slide.addShape(pptx.ShapeType.rect, {
            x,
            y,
            w: cellW,
            h: imageH,
            fill: { color: 'F1F5F9' },
            line: { color: 'E5E7EB', width: 0.5 }
          });
        }
        if (picture.caption?.trim()) {
          slide.addText(picture.caption.trim(), {
            ...font,
            x,
            y: y + imageH,
            w: cellW,
            h: captionH,
            fontSize: 11,
            color: theme.footer,
            align: 'center',
            valign: 'middle'
          });
        }
      }
    } else {
      // bullets（默认）
      slide.background = { color: theme.pageBg };
      addHeader(slide, item.title);
      slide.addText(bullets(item.items), {
        ...font,
        x: PPT_M + 0.1,
        y: 1.5,
        w: PPT_W - 2 * PPT_M - 0.2,
        h: PPT_H - 2.1,
        fontSize: 16,
        color: theme.text,
        valign: 'top',
        lineSpacingMultiple: 1.4
      });
    }

    if (item.notes?.trim()) slide.addNotes(item.notes.trim());
    decorate(slide);
  }

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
};

/**
 * 生成 PowerPoint 演示文稿；支持模板化版式。
 */
export const createPptBuffer = async (deck: PptDeck & { platform?: string }): Promise<Buffer> => {
  const parsed = pptDeckSchema.parse(deck);
  return buildPptx(parsed as PptDeck & { platform?: string }, resolveFonts(parsed.platform).cjk);
};
