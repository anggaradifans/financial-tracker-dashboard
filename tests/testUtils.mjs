import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';

export async function loadTsModule(relativePath, importMetaUrl, extraImports = {}) {
  const url = new URL(relativePath, importMetaUrl);
  const source = await readFile(url, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(outputText, { context });
  await module.link(specifier => {
    if (specifier in extraImports) {
      const exp = extraImports[specifier];
      return new vm.SyntheticModule(Object.keys(exp), function () {
        for (const [k, v] of Object.entries(exp)) this.setExport(k, v);
      }, { context });
    }
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}
