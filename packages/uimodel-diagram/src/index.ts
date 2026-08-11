import type { ModuleContext, ModuleLifecycle } from '@eclipse-daanse/tsm'
import DiagramViewComposer from './DiagramViewComposer.vue'

export { default as DiagramViewComposer } from './DiagramViewComposer.vue'

export const activate = (context: ModuleContext): void => {
  context.log.info('uimodel-diagram activated')
  context.services.register('uimodel-diagram.composer', DiagramViewComposer)
}

export const deactivate = (context: ModuleContext): void => {
  context.log.info('uimodel-diagram deactivated')
  context.services.unregister('uimodel-diagram.composer')
}

export default { activate, deactivate } satisfies ModuleLifecycle
