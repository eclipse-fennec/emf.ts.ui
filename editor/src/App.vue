<script setup lang="ts">
/**
 * UIModel & Style Editor — 3-Spalten-Layout:
 * Outline-Baum | Live-Preview/CSS | Property-Panel.
 * Undo/Redo über @emfts/command, Speichern als XMI-Download.
 */
import { provide } from 'vue';
import type { LoadedEditorData } from './emf/loadEditorResources';
import { createEditor, EDITOR_KEY } from './editor/useEditor';
import ModelTree from './components/ModelTree.vue';
import PropertyPanel from './components/PropertyPanel.vue';
import PreviewPane from './components/PreviewPane.vue';

const props = defineProps<{ loaded: LoadedEditorData }>();

const editor = createEditor(props.loaded);
provide(EDITOR_KEY, editor);

function download(): void {
  for (const { fileName, content } of editor.serialize()) {
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  editor.dirty.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key === 'z' && !event.shiftKey) {
    event.preventDefault();
    editor.undo();
  } else if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
    event.preventDefault();
    editor.redo();
  } else if (event.key === 's') {
    event.preventDefault();
    download();
  }
}
</script>

<template>
  <div class="editor-app" tabindex="-1" @keydown="onKeydown">
    <header class="editor-header">
      <h1>UIModel &amp; Style Editor</h1>
      <span class="editor-subtitle">
        <code>person-form.xmi</code> + <code>styles.xmi</code>
        <span v-if="editor.dirty.value" class="dirty-dot" title="Ungespeicherte Änderungen">●</span>
      </span>
      <div class="editor-actions">
        <button class="action" :disabled="!editor.canUndo.value" title="Strg+Z" @click="editor.undo()">↩ Undo</button>
        <button class="action" :disabled="!editor.canRedo.value" title="Strg+Y" @click="editor.redo()">↪ Redo</button>
        <button class="action action--primary" title="Strg+S" @click="download">⬇ XMI speichern</button>
      </div>
    </header>

    <main class="editor-main">
      <aside class="editor-tree"><ModelTree /></aside>
      <section class="editor-preview"><PreviewPane /></section>
      <aside class="editor-props"><PropertyPanel /></aside>
    </main>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f4f5f7; color: #1a1a2e; }

.editor-app { min-height: 100vh; display: flex; flex-direction: column; outline: none; }

/* ── Header ─────────────────────────────────────────────────────── */
.editor-header { display: flex; align-items: center; gap: 1rem; background: #1a1a2e; color: #fff; padding: .75rem 1.5rem; }
.editor-header h1 { font-size: 1.05rem; font-weight: 600; }
.editor-subtitle { font-size: .78rem; color: #aab; }
.editor-subtitle code { background: rgba(255,255,255,.12); padding: .1em .4em; border-radius: 4px; }
.dirty-dot { color: #fbbf24; margin-left: .4rem; }
.editor-actions { margin-left: auto; display: flex; gap: .5rem; }
.action { background: rgba(255,255,255,.1); color: #dde; border: none; padding: .4rem .9rem; border-radius: 6px; cursor: pointer; font-size: .82rem; }
.action:hover:not(:disabled) { background: rgba(255,255,255,.22); color: #fff; }
.action:disabled { opacity: .4; cursor: default; }
.action--primary { background: #5b5fd6; color: #fff; }
.action--primary:hover { background: #6d71e8; }

/* ── Layout ─────────────────────────────────────────────────────── */
.editor-main { flex: 1; display: grid; grid-template-columns: 320px 1fr 360px; min-height: 0; }
.editor-tree, .editor-props { background: #fff; overflow: auto; padding: 1rem; max-height: calc(100vh - 56px); }
.editor-tree { border-right: 1px solid #e0e0e8; }
.editor-props { border-left: 1px solid #e0e0e8; }
.editor-preview { overflow: auto; padding: 1.25rem 1.5rem; max-height: calc(100vh - 56px); }

/* ── Baum ───────────────────────────────────────────────────────── */
.tree-section__title { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: #667; margin: .8rem 0 .4rem; }
.tree-children { list-style: none; padding-left: .65rem; }
.tree-children--root { padding-left: 0; }

.tree-row { display: flex; align-items: center; gap: .35rem; padding: .2rem .35rem; border-radius: 5px; cursor: pointer; font-size: .84rem; min-height: 1.55rem; }
.tree-row:hover { background: #f0f0fa; }
.tree-row--selected { background: #e8e8ff; }
.tree-toggle { background: none; border: none; cursor: pointer; width: .95rem; flex: 0 0 auto; color: #889; font-size: .7rem; padding: 0; }
.tree-toggle--leaf { display: inline-block; }
.tree-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #223; flex: 1 1 auto; min-width: 3rem; }
.tree-type { font-size: .68rem; color: #99a; flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Farbpunkt je Element-Art */
.tree-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.tree-dot--root   { background: #64748b; }
.tree-dot--view   { background: #3b82f6; }
.tree-dot--widget { background: #8b5cf6; }
.tree-dot--token  { background: #14b8a6; }
.tree-dot--theme  { background: #6366f1; }
.tree-dot--style  { background: #22c55e; }
.tree-dot--rule   { background: #f59e0b; }
.tree-dot--misc   { background: #cbd5e1; }

/* Feature-Gruppen ("fields (5)") */
.tree-group { list-style: none; }
.tree-group-row { display: flex; align-items: center; gap: .3rem; padding: .12rem .35rem; border-radius: 5px; cursor: pointer; font-size: .72rem; color: #778; min-height: 1.4rem; }
.tree-group-row:hover { background: #f5f5fb; }
.tree-group-toggle { width: .95rem; flex: 0 0 auto; font-size: .65rem; color: #99a; }
.tree-group-name { text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.tree-group-count { background: #eceef6; border-radius: 8px; padding: 0 .45em; font-size: .68rem; color: #667; }

/* Aktionen: erst bei Hover/Selektion sichtbar */
.tree-actions { margin-left: auto; display: flex; gap: .2rem; }
.tree-btn { background: #ececf4; border: none; border-radius: 4px; cursor: pointer; font-size: .72rem; padding: .05rem .4rem; color: #556; line-height: 1.3; }
.tree-btn:hover { background: #dcdcf0; }
.tree-btn--danger { visibility: hidden; }
.tree-row:hover .tree-btn--danger,
.tree-row--selected .tree-btn--danger { visibility: visible; }
.tree-btn--danger:hover { background: #fdd; color: #c00; }
.tree-btn--add { margin-left: auto; background: #e4e6ff; color: #4548b8; font-weight: 600; visibility: hidden; }
.tree-group-row:hover .tree-btn--add { visibility: visible; }
.tree-btn--add:hover { background: #d2d5ff; }

.tree-add-menu { display: flex; flex-direction: column; margin: .15rem 0 .25rem 1.4rem; border: 1px solid #dde; border-radius: 6px; overflow: hidden; background: #fff; box-shadow: 0 3px 10px rgba(0,0,0,.1); max-width: 230px; max-height: 260px; overflow-y: auto; }
.tree-add-caption { font-size: .66rem; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; color: #99a; padding: .3rem .65rem .1rem; background: #fafafe; }
.tree-btn--node-add { visibility: hidden; }
.tree-row:hover .tree-btn--node-add,
.tree-row--selected .tree-btn--node-add { visibility: visible; }
.tree-add-option { background: none; border: none; text-align: left; padding: .32rem .65rem; font-size: .8rem; cursor: pointer; color: #334; }
.tree-add-option:hover { background: #eef; }
.tree-add-option + .tree-add-option { border-top: 1px solid #f2f2f8; }

/* ── Property-Panel ─────────────────────────────────────────────── */
.panel-title { font-size: .9rem; margin-bottom: .8rem; color: #223; }
.panel-hint { font-size: .85rem; color: #99a; font-style: italic; }
.prop-row { display: grid; grid-template-columns: 110px 1fr; align-items: center; gap: .5rem; margin-bottom: .45rem; }
.prop-label { font-size: .74rem; color: #667; word-break: break-word; }
.prop-input { width: 100%; padding: .3rem .5rem; border: 1px solid #ccd; border-radius: 5px; font-size: .82rem; background: #fff; }
.prop-input:focus { outline: none; border-color: #5b5fd6; }
.prop-check { justify-self: start; }
.prop-readonly { font-size: .8rem; color: #889; }
.prop-ref-many { display: flex; flex-direction: column; gap: .25rem; }
.prop-ref-item { display: flex; align-items: center; gap: .4rem; background: #f5f5fb; border-radius: 5px; padding: .2rem .45rem; font-size: .78rem; }
.prop-ref-label { flex: 1; }

/* ── Deklarations-Editor ────────────────────────────────────────── */
.decl-editor { margin-top: 1rem; }
.decl-title { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: #667; margin: .9rem 0 .4rem; }
.decl-row { display: flex; align-items: center; gap: .3rem; margin-bottom: .3rem; }
.decl-prop { flex: 1; }
.decl-value { flex: 1.4; }
.decl-important { font-size: .75rem; color: #a55; display: flex; align-items: center; gap: .1rem; }
.decl-add { background: #eef; border: 1px dashed #aac; border-radius: 5px; padding: .25rem .6rem; font-size: .76rem; cursor: pointer; color: #446; margin-top: .2rem; }
.decl-add:hover { background: #e2e2fc; }
.decl-state { border: 1px solid #e4e4ee; border-radius: 6px; padding: .5rem; margin-bottom: .45rem; }
.decl-state__head { display: flex; gap: .4rem; align-items: center; margin-bottom: .4rem; }

/* ── Preview ────────────────────────────────────────────────────── */
.preview-toolbar { display: flex; align-items: center; gap: 1.2rem; margin-bottom: 1rem; font-size: .84rem; flex-wrap: wrap; }
.preview-toolbar select { padding: .25rem .5rem; border: 1px solid #ccd; border-radius: 5px; background: #fff; }
.preview-tabs { display: flex; gap: .4rem; margin-left: auto; }
.tab { background: #e8e8f0; border: none; padding: .3rem .8rem; border-radius: 6px; cursor: pointer; font-size: .8rem; color: #556; }
.tab--active { background: #5b5fd6; color: #fff; }
.preview-scope { padding: 1rem; border-radius: 10px; min-height: 200px; background: transparent; color: var(--uic-color-text, #1a1a2e); }
.css-source { background: #14141c; color: #c8d3f5; border-radius: 10px; padding: 1rem 1.25rem; font-size: .78rem; line-height: 1.5; overflow: auto; max-height: calc(100vh - 180px); }

/* Konsumenten-Überschriften (Issue #4): FormView.group als Sektionstitel.
   Layout/Headings gehören dem Konsumenten — hier über das gestempelte
   data-uim-group-Attribut, einheitlich für autorierte und generische Modelle. */
.preview-scope .uim-c-FormView[data-uim-group] { margin-bottom: 1rem; }
.preview-scope .uim-c-FormView[data-uim-group]::before {
  content: attr(data-uim-group);
  display: block;
  font-size: .78rem;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--uic-color-muted, #667);
  margin-bottom: .6rem;
}

/* Strukturelle Platzhalter (Issue #6) */
.uimodel-group { display: flex; flex-direction: column; gap: .8rem; }
.uimodel-group--horizontal { flex-direction: row; }
.uimodel-group--horizontal > * { flex: 1; min-width: 0; }
.uimodel-group--grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .8rem; }
.uimodel-foreach-empty { font-size: .85rem; color: var(--uic-color-muted, #99a); font-style: italic; }

/* Widget-Grundlayout (StringFieldWidget) */
.field { display: flex; flex-direction: column; gap: .3rem; }
.field__label { font-size: .75rem; font-weight: 600; color: var(--uic-color-muted, #556); text-transform: uppercase; letter-spacing: .04em; }
.field__required { color: var(--uic-color-danger, #d03); }
.field__input { padding: .5rem .75rem; border: 1px solid var(--uic-color-border, #ccd); border-radius: 6px; font-size: .95rem; background: var(--uic-color-surface, #fff); color: var(--uic-color-text, #1a1a2e); }
.field__input:focus { outline: none; border-color: var(--uic-color-primary, #5b5fd6); }
.field__error { font-size: .75rem; color: var(--uic-color-danger, #d03); }
</style>
