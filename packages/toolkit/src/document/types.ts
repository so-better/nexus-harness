/**
 * 文档生成共享类型。
 */

export interface OfficeFonts {
  cjk: string;
  latin: string;
  mono: string;
}

export interface InlineToken {
  text: string;
  bold?: boolean;
  italics?: boolean;
  code?: boolean;
  link?: string;
}

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' };

export interface PptTheme {
  accent: string;
  text: string;
  coverBg: string;
  coverText: string;
  pageBg: string;
  footer: string;
}

export interface PptSlide {
  layout:
    | 'section'
    | 'bullets'
    | 'twoColumn'
    | 'imageText'
    | 'chart'
    | 'table'
    | 'kpi'
    | 'quote'
    | 'timeline'
    | 'agenda'
    | 'comparison'
    | 'team'
    | 'gallery'
    | 'process'
    | 'end';
  title: string;
  subtitle?: string;
  items?: string[];
  left?: string[];
  right?: string[];
  text?: string[];
  image?: string;
  imageSide?: 'left' | 'right';
  chart?: {
    type: 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'radar';
    categories: string[];
    series: Array<{ name: string; values: number[] }>;
  };
  table?: { headers: string[]; rows: string[][] };
  kpis?: Array<{ value: string; label: string }>;
  quote?: { text: string; author?: string };
  steps?: Array<{ title: string; description?: string }>;
  comparison?: {
    left: { title: string; items: string[] };
    right: { title: string; items: string[] };
  };
  team?: Array<{ name: string; role?: string; avatar?: string }>;
  gallery?: Array<{ image: string; caption?: string }>;
  notes?: string;
}

export interface PptDeck {
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  footer?: string;
  showPageNo?: boolean;
  logo?: string;
  slides: PptSlide[];
}

export interface WordDocumentInput {
  title?: string;
  content: string;
  platform?: string;
}

export interface ExcelSheetInput {
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
}

export interface ExcelDocumentInput {
  sheets: ExcelSheetInput[];
  platform?: string;
}
