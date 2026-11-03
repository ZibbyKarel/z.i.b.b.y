/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder loads hooks as CommonJS */
// electron-builder skips signing when no keychain identity matches, and
// arm64 macOS refuses to run bundles without a (at least ad-hoc) signature.
// Sign the whole bundle ad-hoc after packing; the DMG is built afterwards.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
