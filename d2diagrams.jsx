// src/components/D2Diagram.jsx
import React, { useEffect, useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

const withExt = (p) => (p.endsWith('.d2') ? p : `${p}.d2`);

// one shared D2 instance, loaded lazily (only called from an effect, so SSR is safe)
let d2Promise;
const getD2 = () => (d2Promise ??= import('@terrastruct/d2').then(({ D2 }) => new D2()));

// file URL -> Promise<text>  (shared imports are fetched once)
const fileCache = new Map();
function fetchText(url) {
  if (!fileCache.has(url)) {
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
      return res.text();
    });
    p.catch(() => fileCache.delete(url)); // don't cache failures
    fileCache.set(url, p);
  }
  return fileCache.get(url);
}

// diagram key -> Promise<svg string>
const svgCache = new Map();
function renderD2(url, files, options) {
  const key = JSON.stringify([url, files, options]);
  if (!svgCache.has(key)) {
    const p = (async () => {
      const [, base, file] = url.match(/^(.*\/)([^/]*)$/);
      const entry = withExt(file);
      const fs = {};
      await Promise.all(
        [entry, ...files.map(withExt)].map(async (name) => {
          fs[name] = await fetchText(base + name);
        })
      );
      const d2 = await getD2();
      const r = await d2.compile({ fs, inputPath: entry, options: { layout: 'dagre', ...options } });
      return d2.render(r.diagram, r.renderOptions);
    })();
    p.catch(() => svgCache.delete(key)); // don't cache failures
    svgCache.set(key, p);
  }
  return svgCache.get(key);
}

export default function D2Diagram({ src, files = [], options = {} }) {
  const url = useBaseUrl(src);
  const [out, setOut] = useState({});

  useEffect(() => {
    let cancelled = false;
    renderD2(url, files, options)
      .then((svg) => !cancelled && setOut({ svg }))
      .catch((e) => !cancelled && setOut({ error: String(e.message ?? e) }));
    return () => { cancelled = true; };
  }, [url, files.join('|'), JSON.stringify(options)]);

  if (out.error) return <pre style={{ color: 'red' }}>{out.error}</pre>;
  if (!out.svg) return <div>Rendering diagram…</div>;
  return <div dangerouslySetInnerHTML={{ __html: out.svg }} />;
}