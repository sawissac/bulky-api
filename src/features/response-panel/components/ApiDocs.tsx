import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Theme } from '@/lib/themes';
import type { ApiCall } from '@/lib/types';
import { displayUrl } from '@/lib/callMatch';
import { Copy, FileText, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

type Props = {
  T: Theme;
  calls: ApiCall[];
};

/** View-toggle container: bordered, clipped so View/Raw read as one
 *  segmented group instead of two floating pills. */
const VIEW_GROUP = 'overflow-hidden rounded-md border border-app-border';

/** View-toggle button: ghost hover/active tracks the runtime theme via the
 *  `app-*` tokens instead of Button's default (static) muted/foreground. */
const VIEW_BTN =
  'gap-1 rounded-none border-0 text-[10px] font-bold text-app-dim hover:bg-app-hover hover:text-app-accent data-active:bg-app-selected data-active:text-app-accent';

/** Copy button: outlined at rest, fills with the accent color on hover —
 *  same recipe as the copy control in `RespTab`. */
const COPY_BTN =
  'gap-1 bg-transparent border-app-border text-[10px] font-bold text-app-dim hover:border-app-accent hover:bg-app-accent hover:text-app-on-solid';

export default function ApiDocs({ T, calls }: Props) {
  const [viewMode, setViewMode] = useState<'view' | 'raw'>('view');

  const markdown = useMemo(() => {
    let md = '# API Documentation\n\n';

    calls.forEach((c) => {
      md += `## ${c.method} ${displayUrl(c.urlExpr)}\n\n`;
      md += `**Resolved URL:** \`${displayUrl(c.url)}\`\n\n`;
      
      if (c.status === 'success' || c.status === 'error') {
        md += `**Status:** ${c.statusCode} ${c.status === 'success' ? '✅' : '❌'}\n\n`;
        md += `**Duration:** ${c.duration}ms\n\n`;
        
        if (c.requestHeaders && Object.keys(c.requestHeaders).length > 0) {
          md += `### Request Headers\n\n\`\`\`json\n${JSON.stringify(c.requestHeaders, null, 2)}\n\`\`\`\n\n`;
        }
        
        if (c.requestBody) {
          md += `### Request Body\n\n\`\`\`json\n${JSON.stringify(c.requestBody, null, 2)}\n\`\`\`\n\n`;
        }
        
        if (c.responseHeaders && Object.keys(c.responseHeaders).length > 0) {
          md += `### Response Headers\n\n\`\`\`json\n${JSON.stringify(c.responseHeaders, null, 2)}\n\`\`\`\n\n`;
        }
        
        if (c.response !== null) {
          md += `### Response Body\n\n\`\`\`json\n${JSON.stringify(c.response, null, 2)}\n\`\`\`\n\n`;
        }
        
        if (c.error) {
          md += `### Error\n\n\`\`\`\n${c.error}\n\`\`\`\n\n`;
        }
      } else {
        md += `**Status:** Pending / Not Executed ⏳\n\n`;
      }
      md += '---\n\n';
    });

    return md;
  }, [calls]);

  if (calls.length === 0) {
    return (
      <p className="p-4 text-center font-description text-[12px] text-app-dim">
        No API calls detected in this script
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.bgPanel }}>
      <div style={{ display: 'flex', padding: '8px 12px', gap: 6, borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
        <ButtonGroup className={VIEW_GROUP}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setViewMode('view')}
            data-active={viewMode === 'view' || undefined}
            className={VIEW_BTN}
          >
            <FileText size={12} /> View
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setViewMode('raw')}
            data-active={viewMode === 'raw' || undefined}
            className={VIEW_BTN}
          >
            <FileCode2 size={12} /> Raw
          </Button>
        </ButtonGroup>
        <div style={{ flex: 1 }} />
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => navigator.clipboard.writeText(markdown)}
          className={COPY_BTN}
        >
          <Copy size={12} /> Copy Markdown
        </Button>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px', color: T.textBright, fontFamily: viewMode === 'raw' ? 'var(--font-mono)' : 'var(--font-description)' }}>
        {viewMode === 'raw' ? (
          <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: T.textDim }}>
            {markdown}
          </pre>
        ) : (
          <div className="prose prose-invert max-w-none" style={{ fontSize: 12, minWidth: 0 }}>
            <ReactMarkdown
              components={{
                h1: ({node, ...props}) => <h1 style={{ color: T.accent, fontSize: '1.5em', marginTop: '0.5em', marginBottom: '1em', fontWeight: 600, fontFamily: 'var(--font-title)' }} {...props} />,
                h2: ({node, ...props}) => <h2 style={{ color: T.textBright, fontSize: '1.2em', marginTop: '1.5em', marginBottom: '0.5em', borderBottom: `1px solid ${T.border}`, paddingBottom: '4px', fontWeight: 600, fontFamily: 'var(--font-title)' }} {...props} />,
                h3: ({node, ...props}) => <h3 style={{ color: T.textBright, fontSize: '1.1em', marginTop: '1em', marginBottom: '0.5em', fontWeight: 600, fontFamily: 'var(--font-title)' }} {...props} />,
                p: ({node, ...props}) => <p style={{ marginBottom: '1em', lineHeight: 1.6 }} {...props} />,
                pre: ({node, ...props}) => <pre style={{ background: T.bgHover, padding: '12px', borderRadius: '8px', maxWidth: '100%', overflowX: 'auto', marginBottom: '1em', border: `1px solid ${T.border}` }} {...props} />,
                code: ({node, className, children, ...props}) => {
                  const match = /language-(\w+)/.exec(className || '')
                  return match ? (
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9em' }} {...props}>
                      {children}
                    </code>
                  ) : (
                    <code style={{ display: 'inline-block', maxWidth: '100%', overflowX: 'auto', verticalAlign: 'bottom', background: T.bgHover, padding: '2px 4px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.9em', border: `1px solid ${T.border}`, whiteSpace: 'nowrap' }} {...props}>
                      {children}
                    </code>
                  )
                },
                hr: ({node, ...props}) => <hr style={{ borderColor: T.border, margin: '2em 0' }} {...props} />
              }}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
