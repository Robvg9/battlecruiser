"use strict";

// HTTP text responses may normalize LF/CRLF depending on the serving/runtime path.
// Compare UTF-8 text content with normalized line endings, not platform-specific bytes.
function normalizeTextAsset(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n");
}

function textAssetMatches(actual, expected) {
  return normalizeTextAsset(actual) === normalizeTextAsset(expected);
}

module.exports = { normalizeTextAsset, textAssetMatches };
