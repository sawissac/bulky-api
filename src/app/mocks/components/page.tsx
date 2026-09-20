'use client';

import { useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Provider, useDispatch, useSelector } from 'react-redux';

import { THEMES, themeVars, type Theme, type ThemeKey } from '@/lib/themes';
import { EXAMPLE_SCRIPTS } from '@/lib/sampleData';
import { setBuiltCalls, setLogs } from '@/store/runnerSlice';
import { selectTweaksOpen, setTweaksOpen, type DisplayMode } from '@/store/uiSlice';

import MethodPill from '@/components/MethodPill';
import StatusPill from '@/components/StatusPill';
import KVRow from '@/components/KVRow';
import JNode from '@/components/JsonTreeViewer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizableGroup } from '@/components/ui/resizable';

import ApiDocs from '@/features/response-panel/components/ApiDocs';
import ApiWaterfall from '@/features/response-panel/components/ApiWaterfall';
import AuthTab from '@/features/response-panel/components/AuthTab';
import CallCard from '@/features/response-panel/components/CallCard';
import HeadTab from '@/features/response-panel/components/HeadTab';
import PayloadTab from '@/features/response-panel/components/PayloadTab';
import RespTab from '@/features/response-panel/components/RespTab';
import ResponsePanel from '@/features/response-panel/components/ResponsePanel';
import StatusTab from '@/features/response-panel/components/StatusTab';
import CollPane from '@/features/sidebar/components/CollPane';
import EnvPane from '@/features/sidebar/components/EnvPane';
import FilePane from '@/features/sidebar/components/FilePane';
import Sidebar from '@/features/sidebar/components/Sidebar';
import ActivityRail from '@/features/sidebar/components/ActivityRail';
import DisplayModeDialog from '@/features/sidebar/components/DisplayModeDialog';
import VarsPane from '@/features/sidebar/components/VarsPane';
import TweaksPanel from '@/features/tweaks/components/TweaksPanel';
import ExampleDialog from '@/features/code-editor/components/ExampleDialog';

import { createMockStore } from './mockStore';
import {
  HTTP_METHODS,
  MOCK_CALL,
  MOCK_CALLS,
  MOCK_CALL_CACHED,
  MOCK_CALL_ERROR,
  MOCK_CALL_SSE,
  MOCK_JSON,
  MOCK_REQ_HEADERS,
  MOCK_RES_HEADERS,
  STATUS_CODES,
} from './mockData';

const CodeEditor = dynamic(() => import('@/features/code-editor/components/CodeEditor'), {
  ssr: false,
});
const MonacoCodeEditor = dynamic(
  () => import('@/features/code-editor/components/MonacoCodeEditor'),
  { ssr: false },
);

/** How a catalog entry behaves on this page. */
type Mount =
  /** Renders inline from fixtures, no store needed. */
  | 'live'
  /** Renders inline, but reads the throwaway gallery store. */
  | 'store'
  /** Heavy (Monaco); mounted only when its button is pressed. */
  | 'on-demand'
  /** Overlay; mounted only when its button is pressed. */
  | 'overlay'
  /** Whole-app shell, catalogued but not previewed. */
  | 'shell';

/** One row of the component catalog, and the anchor of its preview section. */
type Entry = {
  /** Anchor id and nav key. */
  id: string;
  /** Exported component name. */
  name: string;
  /** Repo-relative source path. */
  path: string;
  /** Props signature, copied from the source. */
  props: string;
  /** Group heading the entry sits under. */
  group: string;
  /** Preview strategy. */
  mount: Mount;
  /** What the component is for. */
  note: string;
};

const ENTRIES: Entry[] = [
  {
    id: 'method-pill',
    name: 'MethodPill',
    path: 'src/components/MethodPill.tsx',
    props: '{ method: string; sm?: boolean; focusable?: boolean }',
    group: 'Shared components',
    mount: 'live',
    note: 'HTTP method chip, hue from the --method-* token of the active theme; hover/focus raises a tooltip describing the method.',
  },
  {
    id: 'status-pill',
    name: 'StatusPill',
    path: 'src/components/StatusPill.tsx',
    props: '{ code: number | null }',
    group: 'Shared components',
    mount: 'live',
    note: 'Status-code chip; tone derived from the code (idle / ok / redirect / error); hover/focus raises a tooltip naming the code.',
  },
  {
    id: 'kv-row',
    name: 'KVRow',
    path: 'src/components/KVRow.tsx',
    props: '{ T: Theme; k: string; v: string; masked?: boolean }',
    group: 'Shared components',
    mount: 'live',
    note: 'Two-column key/value row used by the header and auth tabs.',
  },
  {
    id: 'json-tree-viewer',
    name: 'JNode (JsonTreeViewer)',
    path: 'src/components/JsonTreeViewer.tsx',
    props: '{ data: unknown; depth?: number; T: Theme }',
    group: 'Shared components',
    mount: 'live',
    note: 'Recursive collapsible JSON tree; open by default to depth 2.',
  },
  {
    id: 'error-boundary',
    name: 'ErrorBoundary',
    path: 'src/components/ErrorBoundary.tsx',
    props: '{ children: ReactNode; fallback?: ReactNode }',
    group: 'Shared components',
    mount: 'live',
    note: 'Class boundary wrapping the app in providers.tsx; retry resets the caught error.',
  },
  {
    id: 'button',
    name: 'Button',
    path: 'src/components/ui/button.tsx',
    props: "ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }",
    group: 'shadcn primitives',
    mount: 'live',
    note: '6 variants x 8 sizes, driven by class-variance-authority.',
  },
  {
    id: 'resizable',
    name: 'ResizableGroup / ResizablePanel / ResizableHandle',
    path: 'src/components/ui/resizable.tsx',
    props: 'GroupProps / PanelProps / SeparatorProps',
    group: 'shadcn primitives',
    mount: 'live',
    note: 'react-resizable-panels wrappers; the app layout splits sidebar / editor / response with these.',
  },
  {
    id: 'status-tab',
    name: 'StatusTab',
    path: 'src/features/response-panel/components/StatusTab.tsx',
    props: '{ T: Theme; call: ApiCall }',
    group: 'Response panel',
    mount: 'live',
    note: 'Status / duration / host summary for one call.',
  },
  {
    id: 'head-tab',
    name: 'HeadTab',
    path: 'src/features/response-panel/components/HeadTab.tsx',
    props: '{ T: Theme; headers: Record<string, string> }',
    group: 'Response panel',
    mount: 'live',
    note: 'Header list; renders an empty state when the record is empty.',
  },
  {
    id: 'payload-tab',
    name: 'PayloadTab',
    path: 'src/features/response-panel/components/PayloadTab.tsx',
    props: '{ T: Theme; call: ApiCall }',
    group: 'Response panel',
    mount: 'live',
    note: 'Request URL expression, headers and body of one call.',
  },
  {
    id: 'auth-tab',
    name: 'AuthTab',
    path: 'src/features/response-panel/components/AuthTab.tsx',
    props: '{ T: Theme; call: ApiCall }',
    group: 'Response panel',
    mount: 'live',
    note: 'Detected auth scheme plus whether an Authorization header was actually sent.',
  },
  {
    id: 'resp-tab',
    name: 'RespTab',
    path: 'src/features/response-panel/components/RespTab.tsx',
    props: '{ T: Theme; call: ApiCall }',
    group: 'Response panel',
    mount: 'live',
    note: 'Response body in pretty / raw / TypeScript views; switches to an SSE event list for streams. Hosted here in a scrolling, 10px-padded box so its sticky control row bleeds over the padding exactly as it does inside CallCard.',
  },
  {
    id: 'call-card',
    name: 'CallCard',
    path: 'src/features/response-panel/components/CallCard.tsx',
    props: '{ T: Theme; call: ApiCall; defaultOpen?: boolean }',
    group: 'Response panel',
    mount: 'store',
    note: 'Collapsible per-call card hosting the four tabs; dispatches the cache toggle.',
  },
  {
    id: 'api-docs',
    name: 'ApiDocs',
    path: 'src/features/response-panel/components/ApiDocs.tsx',
    props: '{ T: Theme; calls: ApiCall[] }',
    group: 'Response panel',
    mount: 'live',
    note: 'Generates markdown API docs from the calls of a run; view / raw toggle.',
  },
  {
    id: 'api-waterfall',
    name: 'ApiWaterfall',
    path: 'src/features/response-panel/components/ApiWaterfall.tsx',
    props: '{ T: Theme }',
    group: 'Response panel',
    mount: 'store',
    note: 'Timeline bars per call, positioned from timestamp + duration against the run start.',
  },
  {
    id: 'response-panel',
    name: 'ResponsePanel',
    path: 'src/features/response-panel/components/ResponsePanel.tsx',
    props: '{ T: Theme }',
    group: 'Response panel',
    mount: 'store',
    note: 'Container for the calls / docs / waterfall views plus the console drawer.',
  },
  {
    id: 'activity-rail',
    name: 'ActivityRail',
    path: 'src/features/sidebar/components/ActivityRail.tsx',
    props: 'none',
    group: 'Sidebar',
    mount: 'store',
    note: 'Fixed 48px left rail: brand, active env, section tabs, run status, call count, fullscreen, tweaks.',
  },
  {
    id: 'display-mode-dialog',
    name: 'DisplayModeDialog',
    path: 'src/features/sidebar/components/DisplayModeDialog.tsx',
    props: '{ mode: DisplayMode; onSelect: (mode: DisplayMode) => void; onClose: () => void }',
    group: 'Sidebar',
    mount: 'overlay',
    note: 'Modal picker for fullscreen vs URL view; the choice is persisted and re-applied on load.',
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    path: 'src/features/sidebar/components/Sidebar.tsx',
    props: '{ T: Theme }',
    group: 'Sidebar',
    mount: 'store',
    note: 'Pane shell: title strip plus whichever of the four panes below the rail selects.',
  },
  {
    id: 'coll-pane',
    name: 'CollPane',
    path: 'src/features/sidebar/components/CollPane.tsx',
    props: '{ T: Theme }',
    group: 'Sidebar',
    mount: 'store',
    note: 'Collections tree: add / rename / remove collections and items, cycle method, import.',
  },
  {
    id: 'env-pane',
    name: 'EnvPane',
    path: 'src/features/sidebar/components/EnvPane.tsx',
    props: '{ T: Theme }',
    group: 'Sidebar',
    mount: 'store',
    note: 'Environments of the active collection; empty state when no collection is selected.',
  },
  {
    id: 'vars-pane',
    name: 'VarsPane',
    path: 'src/features/sidebar/components/VarsPane.tsx',
    props: '{ T: Theme }',
    group: 'Sidebar',
    mount: 'store',
    note: 'Key/value editor for the active environment, with masked-value reveal.',
  },
  {
    id: 'file-pane',
    name: 'FilePane',
    path: 'src/features/sidebar/components/FilePane.tsx',
    props: '{ T: Theme }',
    group: 'Sidebar',
    mount: 'store',
    note: 'Save / load script, import-export collection JSON, import cURL, recent items.',
  },
  {
    id: 'tweaks-panel',
    name: 'TweaksPanel',
    path: 'src/features/tweaks/components/TweaksPanel.tsx',
    props: '{ T: Theme }',
    group: 'Tweaks',
    mount: 'overlay',
    note: 'Modal for theme, layout preset and call-timeout settings — every change applies immediately.',
  },
  {
    id: 'example-dialog',
    name: 'ExampleDialog',
    path: 'src/features/code-editor/components/ExampleDialog.tsx',
    props: '{ T: Theme; example: ExampleScript; onLoad: () => void; onClose: () => void }',
    group: 'Code editor',
    mount: 'overlay',
    note: 'Modal preview of an example script, markdown rendered with react-markdown + remark-gfm.',
  },
  {
    id: 'code-editor',
    name: 'CodeEditor',
    path: 'src/features/code-editor/components/CodeEditor.tsx',
    props:
      '{ T: Theme; onRun: (selection?: string) => void; onNext: () => void; onStop: () => void; running: boolean; stepMode: boolean; paused: boolean; onToggleStep: () => void }',
    group: 'Code editor',
    mount: 'on-demand',
    note: 'Toolbar (run / step / stop / format / examples) wrapped around the Monaco editor.',
  },
  {
    id: 'monaco-code-editor',
    name: 'MonacoCodeEditor',
    path: 'src/features/code-editor/components/MonacoCodeEditor.tsx',
    props:
      '{ value: string; onChange: (v: string) => void; envVars: Record<string, string>; T: Theme; onRun: (selection?: string) => void; onSelectionChange?: (selection: string) => void; onMount?: (editor: EditorInstance) => void }',
    group: 'Code editor',
    mount: 'on-demand',
    note: 'Monaco instance with env-var completions and theme sync. Heavy — mounts on request.',
  },
  {
    id: 'bulky-app',
    name: 'BulkyApp',
    path: 'src/app/BulkyApp.tsx',
    props: 'none',
    group: 'App shell',
    mount: 'shell',
    note: 'The whole application: publishes themeVars() and lays out sidebar / editor / response.',
  },
  {
    id: 'providers',
    name: 'Providers',
    path: 'src/app/providers.tsx',
    props: '{ children: React.ReactNode }',
    group: 'App shell',
    mount: 'shell',
    note: 'Redux Provider + store hydration + service worker + ErrorBoundary.',
  },
];

const GROUPS = Array.from(new Set(ENTRIES.map((e) => e.group)));

const MOUNT_LABEL: Record<Mount, string> = {
  live: 'live',
  store: 'live · mock store',
  'on-demand': 'on demand',
  overlay: 'on demand',
  shell: 'not previewed',
};

const CARD = 'rounded-lg border border-app-border bg-app-panel';
const PREVIEW = 'rounded-md border border-app-border bg-app-bg p-4';
const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-app-dim';
const CODE = 'font-mono text-[11px] text-app-accent';

/** One catalogued component: heading, source path, props signature, and its preview. */
function Section({
  entry,
  children,
}: {
  /** Catalog entry this section documents. */
  entry: Entry;
  /** Rendered preview, or a note about why there is none. */
  children: ReactNode;
}) {
  return (
    <section
      id={entry.id}
      data-testid={`mocks-components-page-section-${entry.id}`}
      className={`${CARD} scroll-mt-4 p-4`}
    >
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-bold text-app-bright">{entry.name}</h3>
        <span className="font-mono text-[11px] text-app-dim">{entry.path}</span>
        <span className="rounded-md border border-app-border-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-app-accent">
          {MOUNT_LABEL[entry.mount]}
        </span>
      </header>
      <p className="mb-2 text-[12px] text-app-text">{entry.note}</p>
      <p className={`mb-3 ${CODE} break-all`}>{entry.props}</p>
      <div className={PREVIEW}>{children}</div>
    </section>
  );
}

/** Labelled strip inside a preview, so one section can show several states. */
function Case({
  title,
  children,
}: {
  /** What the strip demonstrates. */
  title: string;
  /** The rendered variant. */
  children: ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className={`${LABEL} mb-2`}>{title}</div>
      {children}
    </div>
  );
}

/** Throws on demand so the ErrorBoundary preview has something to catch. */
function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error('Mock crash raised by the component gallery');
  return <span className="text-[12px] text-app-text">Child renders fine. Press throw.</span>;
}

/**
 * Wires {@link TweaksPanel} to the gallery's mock store the same way
 * {@link BulkyApp} wires it to the real one: a trigger dispatches
 * `setTweaksOpen(true)`, and the dialog is mounted only while the store says
 * `tweaksOpen`. `TweaksPanel` closes itself by dispatching `setTweaksOpen(false)`
 * directly — it takes no `onClose` prop — so gating it on local component state
 * instead of this selector would leave the preview's Done and close buttons
 * doing nothing.
 */
function TweaksPanelPreview({ T }: { T: Theme }) {
  const dispatch = useDispatch();
  const tweaksOpen = useSelector(selectTweaksOpen);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        data-testid="mocks-components-page-tweaks-panel-button"
        onClick={() => dispatch(setTweaksOpen(true))}
      >
        Open dialog
      </Button>
      {tweaksOpen && <TweaksPanel T={T} />}
    </>
  );
}

/**
 * Component gallery for the app, served at `/mocks/components`.
 *
 * Lists every React component in the codebase with its source path and props
 * signature, and renders a live preview for each one that can stand on its own.
 * Reach for it to eyeball a component against a theme without driving the real
 * app; it is a development surface, not part of the product flow.
 *
 * @remarks
 * Status: stable — Type: route page (client component).
 *
 * State & behavior: owns the selected {@link ThemeKey}, the ErrorBoundary crash
 * flag, and the mount flags for the three heavy previews (ExampleDialog,
 * CodeEditor, MonacoCodeEditor). Publishes the selected theme as `--app-*`
 * custom properties through `themeVars()`, exactly as `BulkyApp` does, so
 * `app-*` Tailwind utilities resolve inside the page.
 *
 * Composition: store-bound components are wrapped in a Redux `Provider` holding
 * a throwaway store from `createMockStore()` — the app store persists every
 * dispatch to localforage, this one does not, so poking at the panes here
 * cannot damage real collections. The store is seeded with the fixtures from
 * `./mockData`. The root layout hides body overflow, so the page scrolls in its
 * own `h-screen overflow-y-auto` column.
 *
 * Accessibility: the nav is a list of in-page anchors; sections carry `id`s
 * matching the catalog rows. The theme picker is a labelled `<select>`.
 *
 * Test ids: theme picker `mocks-components-page-theme-select`, nav links
 * `mocks-components-page-nav-link-<entry-id>`, catalog table
 * `mocks-components-page-catalog-table` with rows
 * `mocks-components-page-catalog-row-<entry-id>`, sections
 * `mocks-components-page-section-<entry-id>`, and the four mount controls
 * `mocks-components-page-crash-button`, `mocks-components-page-example-dialog-button`,
 * `mocks-components-page-code-editor-mount-button`,
 * `mocks-components-page-monaco-mount-button`.
 *
 * Edge cases:
 * - `EnvPane` renders its empty state when the seeded store has no active
 *   collection; `VarsPane` still shows its editable Base section and only
 *   swaps a hint line in for the environment section.
 * - Monaco is loaded through `next/dynamic` with `ssr: false`; until its button
 *   is pressed nothing from `monaco-editor` is downloaded.
 *
 * Dependencies: `react-redux`, `next/dynamic`, every component it catalogues.
 */
export default function MocksComponentsPage() {
  const [themeKey, setThemeKey] = useState<ThemeKey>('midnight');
  const [crash, setCrash] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showDisplayMode, setShowDisplayMode] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('fullscreen');
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showMonaco, setShowMonaco] = useState(false);
  const [monacoValue, setMonacoValue] = useState(
    'const res = await api.get(`${BASE_URL}/v1/users`);\nconsole.log(res.status);\n',
  );

  const T: Theme = THEMES[themeKey] ?? THEMES.midnight;

  const store = useMemo(() => {
    const s = createMockStore();
    s.dispatch(setBuiltCalls(MOCK_CALLS));
    s.dispatch(
      setLogs([
        { level: 'log', msg: 'POST /v1/users → 200 in 342ms' },
        { level: 'warn', msg: 'DELETE /v1/users/usr_missing → 404' },
        { level: 'error', msg: 'Request failed with status 404' },
      ]),
    );
    return s;
  }, []);

  const noop = () => {};

  return (
    <div
      style={themeVars(T) as React.CSSProperties}
      className="flex h-screen w-full overflow-hidden bg-app-bg font-sans text-app-text"
    >
      <nav
        data-testid="mocks-components-page-nav-list"
        className="hidden h-full w-60 shrink-0 overflow-y-auto border-r border-app-border bg-app-sidebar p-4 md:block"
      >
        <div className="mb-3 text-[13px] font-bold text-app-bright">Component gallery</div>
        <label className={`${LABEL} mb-1 block`} htmlFor="mocks-theme">
          Theme
        </label>
        <select
          id="mocks-theme"
          data-testid="mocks-components-page-theme-select"
          value={themeKey}
          onChange={(e) => setThemeKey(e.target.value as ThemeKey)}
          className="mb-4 w-full rounded-md border border-app-border bg-app-hover px-2 py-1.5 text-[12px] text-app-bright outline-none"
        >
          {Object.keys(THEMES).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {GROUPS.map((group) => (
          <div key={group} className="mb-4">
            <div className={`${LABEL} mb-1.5`}>{group}</div>
            <ul className="space-y-0.5">
              {ENTRIES.filter((e) => e.group === group).map((e) => (
                <li key={e.id}>
                  <a
                    href={`#${e.id}`}
                    data-testid={`mocks-components-page-nav-link-${e.id}`}
                    className="block truncate rounded-sm px-1 py-0.5 text-[12px] text-app-text hover:bg-app-hover hover:text-app-accent"
                  >
                    {e.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <main className="h-full flex-1 overflow-y-auto p-5">
        <header className="mb-5">
          <h1 className="text-[20px] font-extrabold text-app-bright">Components</h1>
          <p className="mt-1 max-w-3xl text-[12px] text-app-text">
            Every React component in this codebase — {ENTRIES.length} in total — with its source
            path, props signature and a live preview where the component can stand on its own.
            Store-bound components run against a throwaway Redux store, so nothing here writes to
            saved collections.
          </p>
        </header>

        <div className={`${CARD} mb-6 overflow-x-auto`}>
          <table
            data-testid="mocks-components-page-catalog-table"
            className="w-full min-w-[640px] border-collapse text-left"
          >
            <thead>
              <tr className="border-b border-app-border">
                <th className={`${LABEL} p-2.5`}>Component</th>
                <th className={`${LABEL} p-2.5`}>Path</th>
                <th className={`${LABEL} p-2.5`}>Group</th>
                <th className={`${LABEL} p-2.5`}>Preview</th>
              </tr>
            </thead>
            <tbody>
              {ENTRIES.map((e) => (
                <tr
                  key={e.id}
                  data-testid={`mocks-components-page-catalog-row-${e.id}`}
                  className="border-b border-app-border last:border-b-0 hover:bg-app-hover"
                >
                  <td className="p-2.5 text-[12px] font-semibold text-app-bright">
                    <a href={`#${e.id}`} className="hover:text-app-accent">
                      {e.name}
                    </a>
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-app-dim">{e.path}</td>
                  <td className="p-2.5 text-[12px] text-app-text">{e.group}</td>
                  <td className="p-2.5 text-[11px] text-app-accent">{MOUNT_LABEL[e.mount]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4">
          <Section entry={ENTRIES[0]}>
            <Case title="Default">
              <div className="flex flex-wrap gap-2">
                {HTTP_METHODS.map((m) => (
                  <MethodPill key={m} method={m} />
                ))}
              </div>
            </Case>
            <Case title="sm">
              <div className="flex flex-wrap gap-2">
                {HTTP_METHODS.map((m) => (
                  <MethodPill key={m} method={m} sm />
                ))}
              </div>
            </Case>
          </Section>

          <Section entry={ENTRIES[1]}>
            <div className="flex flex-wrap gap-2">
              {STATUS_CODES.map((c) => (
                <StatusPill key={String(c)} code={c} />
              ))}
            </div>
          </Section>

          <Section entry={ENTRIES[2]}>
            <KVRow T={T} k="Content-Type" v="application/json" />
            <KVRow T={T} k="X-Request-Id" v="req_01HZX9K2QF" />
            <KVRow T={T} k="Authorization" v={MOCK_REQ_HEADERS.Authorization} masked />
          </Section>

          <Section entry={ENTRIES[3]}>
            <div className="font-mono text-[11px]">
              <JNode data={MOCK_JSON} T={T} />
            </div>
          </Section>

          <Section entry={ENTRIES[4]}>
            <div className="flex items-center gap-3">
              <ErrorBoundary
                key={crash ? 'crashed' : 'clean'}
                fallback={
                  <span className="text-[12px] text-app-error">
                    Fallback rendered — boundary caught the throw.
                  </span>
                }
              >
                <Boom crash={crash} />
              </ErrorBoundary>
              <Button
                size="xs"
                variant="outline"
                data-testid="mocks-components-page-crash-button"
                onClick={() => setCrash((v) => !v)}
              >
                {crash ? 'Reset' : 'Throw'}
              </Button>
            </div>
          </Section>

          <Section entry={ENTRIES[5]}>
            {(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const).map(
              (variant) => (
                <Case key={variant} title={variant}>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['xs', 'sm', 'default', 'lg'] as const).map((size) => (
                      <Button key={size} variant={variant} size={size}>
                        {size}
                      </Button>
                    ))}
                    <Button variant={variant} size="icon-sm" aria-label="icon">
                      ●
                    </Button>
                    <Button variant={variant} disabled>
                      disabled
                    </Button>
                  </div>
                </Case>
              ),
            )}
          </Section>

          <Section entry={ENTRIES[6]}>
            <div className="h-32 overflow-hidden rounded-md border border-app-border">
              <ResizableGroup orientation="horizontal">
                <ResizablePanel defaultSize={35}>
                  <div className="flex h-full items-center justify-center text-[12px] text-app-dim">
                    left
                  </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel>
                  <div className="flex h-full items-center justify-center text-[12px] text-app-dim">
                    right
                  </div>
                </ResizablePanel>
              </ResizableGroup>
            </div>
          </Section>

          <Section entry={ENTRIES[7]}>
            <Case title="200 · success">
              <StatusTab T={T} call={MOCK_CALL} />
            </Case>
            <Case title="404 · error">
              <StatusTab T={T} call={MOCK_CALL_ERROR} />
            </Case>
          </Section>

          <Section entry={ENTRIES[8]}>
            <Case title="Response headers">
              <HeadTab T={T} headers={MOCK_RES_HEADERS} />
            </Case>
            <Case title="Empty">
              <HeadTab T={T} headers={{}} />
            </Case>
          </Section>

          <Section entry={ENTRIES[9]}>
            <PayloadTab T={T} call={MOCK_CALL} />
          </Section>

          <Section entry={ENTRIES[10]}>
            <Case title="Bearer token">
              <AuthTab T={T} call={MOCK_CALL} />
            </Case>
            <Case title="No auth">
              <AuthTab T={T} call={MOCK_CALL_ERROR} />
            </Case>
          </Section>

          <Section entry={ENTRIES[11]}>
            <Case title="JSON response">
              <div className="max-h-[500px] overflow-y-auto overflow-x-hidden bg-app-panel p-2.5">
                <RespTab T={T} call={MOCK_CALL} />
              </div>
            </Case>
            <Case title="SSE stream">
              <div className="max-h-[500px] overflow-y-auto overflow-x-hidden bg-app-panel p-2.5">
                <RespTab T={T} call={MOCK_CALL_SSE} />
              </div>
            </Case>
          </Section>

          <Provider store={store}>
            <Section entry={ENTRIES[12]}>
              <Case title="Open">
                <CallCard T={T} call={MOCK_CALL} defaultOpen />
              </Case>
              <Case title="Collapsed · cached">
                <CallCard T={T} call={MOCK_CALL_CACHED} />
              </Case>
              <Case title="Collapsed · error">
                <CallCard T={T} call={MOCK_CALL_ERROR} />
              </Case>
            </Section>

            <Section entry={ENTRIES[13]}>
              <div className="max-h-96 overflow-auto">
                <ApiDocs T={T} calls={MOCK_CALLS} />
              </div>
            </Section>

            <Section entry={ENTRIES[14]}>
              <ApiWaterfall T={T} />
            </Section>

            <Section entry={ENTRIES[15]}>
              <div className="h-[420px] overflow-hidden rounded-md border border-app-border">
                <ResponsePanel T={T} stepMode={false} running={false} onToggleStep={noop} />
              </div>
            </Section>

            <Section entry={ENTRIES[16]}>
              <div className="h-[420px] w-12 overflow-hidden rounded-md border border-app-border">
                <ActivityRail />
              </div>
            </Section>

            <Section entry={ENTRIES[17]}>
              <Button
                size="sm"
                variant="outline"
                data-testid="mocks-components-page-display-mode-dialog-button"
                onClick={() => setShowDisplayMode(true)}
              >
                Open picker
              </Button>
              {showDisplayMode && (
                <DisplayModeDialog
                  mode={displayMode}
                  onConfirm={(next) => {
                    setDisplayMode(next);
                    setShowDisplayMode(false);
                  }}
                  onClose={() => setShowDisplayMode(false)}
                />
              )}
            </Section>

            <Section entry={ENTRIES[18]}>
              <div className="h-[420px] w-64 overflow-hidden rounded-md border border-app-border">
                <Sidebar T={T} />
              </div>
            </Section>

            <Section entry={ENTRIES[19]}>
              <div className="h-80 w-64 overflow-hidden rounded-md border border-app-border bg-app-sidebar">
                <CollPane T={T} />
              </div>
            </Section>

            <Section entry={ENTRIES[20]}>
              <div className="h-80 w-64 overflow-hidden rounded-md border border-app-border bg-app-sidebar">
                <EnvPane T={T} />
              </div>
            </Section>

            <Section entry={ENTRIES[21]}>
              <div className="h-80 w-64 overflow-hidden rounded-md border border-app-border bg-app-sidebar">
                <VarsPane T={T} />
              </div>
            </Section>

            <Section entry={ENTRIES[22]}>
              <div className="h-80 w-64 overflow-hidden rounded-md border border-app-border bg-app-sidebar">
                <FilePane T={T} />
              </div>
            </Section>

            <Section entry={ENTRIES[23]}>
              <TweaksPanelPreview T={T} />
            </Section>
          </Provider>

          <Section entry={ENTRIES[24]}>
            <Button
              size="sm"
              variant="outline"
              data-testid="mocks-components-page-example-dialog-button"
              onClick={() => setShowExample(true)}
            >
              Open dialog
            </Button>
            {showExample && (
              <ExampleDialog
                T={T}
                example={EXAMPLE_SCRIPTS[0]}
                onLoad={() => setShowExample(false)}
                onClose={() => setShowExample(false)}
              />
            )}
          </Section>

          <Provider store={store}>
            <Section entry={ENTRIES[25]}>
              <Button
                size="sm"
                variant="outline"
                data-testid="mocks-components-page-code-editor-mount-button"
                onClick={() => setShowCodeEditor((v) => !v)}
              >
                {showCodeEditor ? 'Unmount editor' : 'Mount editor'}
              </Button>
              {showCodeEditor && (
                <div className="mt-3 h-[420px] overflow-hidden rounded-md border border-app-border">
                  <CodeEditor
                    T={T}
                    onRun={noop}
                    onNext={noop}
                    onStop={noop}
                    running={false}
                    paused={false}
                    onSendSocketMessage={noop}
                    onCloseSocket={noop}
                  />
                </div>
              )}
            </Section>
          </Provider>

          <Section entry={ENTRIES[26]}>
            <Button
              size="sm"
              variant="outline"
              data-testid="mocks-components-page-monaco-mount-button"
              onClick={() => setShowMonaco((v) => !v)}
            >
              {showMonaco ? 'Unmount Monaco' : 'Mount Monaco'}
            </Button>
            {showMonaco && (
              <div className="mt-3 h-80 overflow-hidden rounded-md border border-app-border">
                <MonacoCodeEditor
                  value={monacoValue}
                  onChange={setMonacoValue}
                  envVars={{ BASE_URL: 'https://api.example.com', TOKEN: 'mock-token' }}
                  T={T}
                  onRun={noop}
                />
              </div>
            )}
          </Section>

          <Section entry={ENTRIES[27]}>
            <p className="text-[12px] text-app-dim">
              The application root. Previewing it here would nest a second copy of the app inside
              the gallery — open <span className={CODE}>/</span> instead.
            </p>
          </Section>

          <Section entry={ENTRIES[28]}>
            <p className="text-[12px] text-app-dim">
              Wraps the tree in the real Redux store, hydrates it from localforage and registers the
              service worker. Already active above this page via{' '}
              <span className={CODE}>src/app/layout.tsx</span>.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
