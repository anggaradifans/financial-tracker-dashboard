import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';

export async function loadTsModule(relativePath, importMetaUrl, extraImports = {}, loaded = new Map(), context = null) {
  let resolvedUrl = new URL(relativePath, importMetaUrl);
  if (!resolvedUrl.pathname.endsWith('.ts') && !resolvedUrl.pathname.endsWith('.mjs') && !resolvedUrl.pathname.endsWith('.js')) {
    resolvedUrl = new URL(relativePath + '.ts', importMetaUrl);
  }
  const cacheKey = resolvedUrl.href;
  if (loaded.has(cacheKey)) {
    return loaded.get(cacheKey);
  }

  const vmContext = context || vm.createContext({});
  const source = await readFile(resolvedUrl, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const module = new vm.SourceTextModule(outputText, { context: vmContext, identifier: cacheKey });
  loaded.set(cacheKey, module);

  await module.link(async (specifier) => {
    if (specifier in extraImports) {
      const exp = extraImports[specifier];
      return new vm.SyntheticModule(Object.keys(exp), function () {
        for (const [k, v] of Object.entries(exp)) this.setExport(k, v);
      }, { context: vmContext });
    }
    if (specifier.startsWith('.')) {
      let childUrl = new URL(specifier, resolvedUrl);
      if (!childUrl.pathname.endsWith('.ts') && !childUrl.pathname.endsWith('.mjs') && !childUrl.pathname.endsWith('.js')) {
        childUrl = new URL(specifier + '.ts', resolvedUrl);
      }
      await loadTsModule(specifier, resolvedUrl, extraImports, loaded, vmContext);
      return loaded.get(childUrl.href);
    }
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}
