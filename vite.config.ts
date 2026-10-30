import {readFileSync} from "node:fs";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// CI stamps package.json in the runner BEFORE both browser and Windows builds.
// Local developers keep the source package's development version.
const {version}=JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8")) as {version:string};
const commit=process.env.GITHUB_SHA?.slice(0,12)??"local";
const buildDate=new Date().toISOString().slice(0,10);
export default defineConfig({
 plugins:[react(),tailwindcss(),tsconfigPaths()],
 base:"./",
 define:{
  __APP_VERSION__:JSON.stringify(version),
  __APP_COMMIT__:JSON.stringify(commit),
  __APP_BUILD_DATE__:JSON.stringify(buildDate),
 },
 build:{outDir:"dist",assetsInlineLimit:0}
});
