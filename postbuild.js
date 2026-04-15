import { readFileSync, writeFileSync } from "fs";

const manifest = JSON.parse(readFileSync(".output/firefox-mv3/manifest.json", "utf8"));

manifest.browser_specific_settings.gecko.data_collection_permissions = {
  required: ["none"],
};

writeFileSync(".output/firefox-mv3/manifest.json", JSON.stringify(manifest, null, 2));
