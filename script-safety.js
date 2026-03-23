(function(global) {
  'use strict';

  var DEFAULT_MAX_SCRIPT_BYTES = 12288;
  var PRACTICAL_WARN_SCRIPT_BYTES = 6000;
  var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  function byteLength(text) {
    if (!text) return 0;
    if (encoder) return encoder.encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function pushIssue(list, level, message) {
    list.push({ level: level, message: message });
  }

  function addRegexWarning(code, issues, regex, message) {
    if (regex.test(code)) pushIssue(issues, 'warn', message);
  }

  function analyze(code, opts) {
    var options = opts || {};
    var maxBytes = options.maxBytes || DEFAULT_MAX_SCRIPT_BYTES;
    var source = code || '';
    var issues = [];
    var bytes = byteLength(source);

    if (!source.trim()) {
      pushIssue(issues, 'error', 'Script is empty.');
      return { bytes: bytes, maxBytes: maxBytes, issues: issues, hasErrors: true, hasWarnings: false };
    }

    if (bytes > maxBytes) {
      pushIssue(issues, 'error', 'Script exceeds the ' + maxBytes + ' byte device limit.');
    } else if (bytes > PRACTICAL_WARN_SCRIPT_BYTES) {
      pushIssue(issues, 'warn', 'Large scripts above ' + PRACTICAL_WARN_SCRIPT_BYTES + ' bytes can compile unreliably on hardware. Trim comments, helper duplication, and state if you can.');
    }

    try {
      // Parse only; do not execute user code.
      // eslint-disable-next-line no-new-func
      new Function(source + '\nreturn 0;');
    } catch (err) {
      pushIssue(issues, 'error', 'Syntax error: ' + err.message);
    }

    if (!/\bfunction\s+update\s*\(/.test(source)) {
      pushIssue(issues, 'error', 'Missing required update(m) function.');
    }

    if (/\bwhile\s*\(\s*(?:true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)/.test(source)) {
      pushIssue(issues, 'error', 'Explicit infinite loops can freeze the device before it can recover.');
    }

    addRegexWarning(
      source,
      issues,
      /\bwhile\s*\(/,
      'Unbounded while-loops are risky on hardware. Prefer m.tick() or add an explicit step cap.'
    );

    addRegexWarning(
      source,
      issues,
      /\bsetTimeout\s*\(|\bsetInterval\s*\(|\brequestAnimationFrame\s*\(/,
      'Browser timers are not available on the device. Use m.tick() instead.'
    );

    addRegexWarning(
      source,
      issues,
      /\bwindow\b|\bdocument\b|\blocalStorage\b|\bnavigator\b|\bfetch\s*\(/,
      'Browser APIs are not available on the device or in the firmware runtime.'
    );

    addRegexWarning(
      source,
      issues,
      /\bm\.delta\b|\bm\.pixel\s*\(/,
      'Old script API names like m.delta and m.pixel are not supported. Use m.dt and m.px().'
    );

    addRegexWarning(
      source,
      issues,
      /\beval\s*\(|\bnew\s+Function\b/,
      'Dynamic code generation is expensive and hard to recover from on hardware.'
    );

    return {
      bytes: bytes,
      maxBytes: maxBytes,
      issues: issues,
      hasErrors: issues.some(function(issue) { return issue.level === 'error'; }),
      hasWarnings: issues.some(function(issue) { return issue.level === 'warn'; }),
    };
  }

  function summarize(report, opts) {
    if (!report || !report.issues || !report.issues.length) return '';

    var options = opts || {};
    var maxItems = options.maxItems || 2;
    var prefix = options.prefix || '';
    var picked = report.issues.slice(0, maxItems).map(function(issue) {
      return issue.message;
    });
    var extra = report.issues.length - picked.length;
    if (extra > 0) picked.push('+' + extra + ' more');
    return (prefix ? prefix + ' ' : '') + picked.join(' ');
  }

  global.ShimmerScriptSafety = {
    DEFAULT_MAX_SCRIPT_BYTES: DEFAULT_MAX_SCRIPT_BYTES,
    PRACTICAL_WARN_SCRIPT_BYTES: PRACTICAL_WARN_SCRIPT_BYTES,
    analyze: analyze,
    summarize: summarize,
  };
})(window);
