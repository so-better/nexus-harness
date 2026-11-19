/**
 * 插件契约：manifest、权限、贡献点与宿主 public 描述。
 */

import { z } from 'zod';

export const PLUGIN_SLOT_LOCATIONS = [
  'sidebar.header',
  'sidebar.footer',
  'statusbar.left',
  'statusbar.right',
  'composer.toolbar',
  'composer.above',
  'composer.footer',
  'empty-state',
  'session.header.actions',
  'session.item.actions',
  'message.assistant.header',
  'message.assistant.footer',
  'message.assistant.actions',
  'message.user.footer',
  'message.user.actions',
  'toolcall.body',
  'toolcall.footer',
  'terminal.toolbar',
  'filecard.actions',
  'filecard.footer'
] as const;

export type PluginSlotLocation = (typeof PLUGIN_SLOT_LOCATIONS)[number];
export const pluginSlotLocationSchema = z.enum(PLUGIN_SLOT_LOCATIONS);

export const pluginPermissionSchema = z.enum([
  'storage',
  'ui.panel',
  'ui.slot',
  'ui.skin',
  'ui.statusbar',
  'ui.command',
  'ui.notification',
  'workspace:read'
]);
export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export const pluginEventPermissionSchema = z.string().regex(/^events:[\w.*-]+$/);

const eventPermission = pluginEventPermissionSchema;

const pluginViewSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  location: z.enum(['sidebar', 'main', 'bottom'])
});

const pluginSlotSchema = z.object({
  id: z.string().min(1),
  location: pluginSlotLocationSchema
});

const pluginStatusBarSchema = z.object({
  id: z.string().min(1),
  align: z.enum(['left', 'right']).default('right')
});

const pluginCommandSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shortcut: z.string().optional()
});

const pluginSettingSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean']),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  title: z.string().optional()
});

const pluginSkinSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1)
});

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9-]+)+$/, '插件 id 必须是反向域名'),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  engines: z.object({ nexus: z.string().min(1) }),
  main: z.string().min(1).optional(),
  renderer: z.string().min(1).optional(),
  activationEvents: z.array(z.string().min(1)).default([]),
  permissions: z.array(z.union([pluginPermissionSchema, eventPermission])).default([]),
  contributes: z
    .object({
      views: z.array(pluginViewSchema).default([]),
      messageSlots: z.array(pluginSlotSchema).default([]),
      statusBar: z.array(pluginStatusBarSchema).default([]),
      commands: z.array(pluginCommandSchema).default([]),
      settings: z.array(pluginSettingSchema).default([]),
      skins: z.array(pluginSkinSchema).default([])
    })
    .default({
      views: [],
      messageSlots: [],
      statusBar: [],
      commands: [],
      settings: [],
      skins: []
    })
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export const pluginPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  source: z.enum(['builtin', 'user']),
  error: z.string().optional(),
  permissions: z.array(z.string()),
  activationEvents: z.array(z.string()),
  contributes: pluginManifestSchema.shape.contributes,
  rendererUrl: z.string().optional(),
  hasMain: z.boolean(),
  mainLoaded: z.boolean()
});
export type PluginPublic = z.infer<typeof pluginPublicSchema>;

export const pluginSkinSelectionSchema = z.object({
  pluginId: z.string().min(1),
  skinId: z.string().min(1)
});
export type PluginSkinSelection = z.infer<typeof pluginSkinSelectionSchema>;

export interface PluginWorkspaceEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export const pluginSettingValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type PluginSettingValue = z.infer<typeof pluginSettingValueSchema>;
