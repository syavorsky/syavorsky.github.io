var CommentParser = (function (exports) {
    'use strict';

    var __assign = (window && window.__assign) || function () {
        __assign = Object.assign || function(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };
    function isSpace(source) {
        return /^\s+$/.test(source);
    }
    function splitSpace(source) {
        var matches = source.match(/^\s+/);
        return matches == null
            ? ['', source]
            : [source.slice(0, matches[0].length), source.slice(matches[0].length)];
    }
    function splitLines(source) {
        return source.split(/\r?\n/);
    }
    function seedSpec(spec) {
        if (spec === void 0) { spec = {}; }
        return __assign({ tag: '', name: '', type: '', optional: false, description: '', problems: [], source: [] }, spec);
    }
    function seedTokens(tokens) {
        if (tokens === void 0) { tokens = {}; }
        return __assign({ start: '', delimiter: '', postDelimiter: '', tag: '', postTag: '', name: '', postName: '', type: '', postType: '', description: '', end: '' }, tokens);
    }

    var Markers;
    (function (Markers) {
        Markers["start"] = "/**";
        Markers["nostart"] = "/***";
        Markers["delim"] = "*";
        Markers["end"] = "*/";
    })(Markers || (Markers = {}));

    function getParser(_a) {
        var _b = (_a === void 0 ? {} : _a).startLine, startLine = _b === void 0 ? 0 : _b;
        var block = null;
        var num = startLine;
        return function parseSource(source) {
            var _a, _b, _c;
            var rest = source;
            var tokens = seedTokens();
            _a = splitSpace(rest), tokens.start = _a[0], rest = _a[1];
            if (block === null &&
                rest.startsWith(Markers.start) &&
                !rest.startsWith(Markers.nostart)) {
                block = [];
                tokens.delimiter = rest.slice(0, Markers.start.length);
                rest = rest.slice(Markers.start.length);
                _b = splitSpace(rest), tokens.postDelimiter = _b[0], rest = _b[1];
            }
            if (block === null) {
                num++;
                return null;
            }
            var isClosed = rest.trimRight().endsWith(Markers.end);
            if (tokens.delimiter === '' &&
                rest.startsWith(Markers.delim) &&
                !rest.startsWith(Markers.end)) {
                tokens.delimiter = Markers.delim;
                rest = rest.slice(Markers.delim.length);
                _c = splitSpace(rest), tokens.postDelimiter = _c[0], rest = _c[1];
            }
            if (isClosed) {
                var trimmed = rest.trimRight();
                tokens.end = rest.slice(trimmed.length - Markers.end.length);
                rest = trimmed.slice(0, -Markers.end.length);
            }
            tokens.description = rest;
            block.push({ number: num, source: source, tokens: tokens });
            num++;
            if (isClosed) {
                var result = block.slice();
                block = null;
                return result;
            }
            return null;
        };
    }

    var reTag = /^@\S+/;
    function getParser$1(_a) {
        var _b = (_a === void 0 ? {} : _a).fence, fence = _b === void 0 ? '```' : _b;
        var fencer = getFencer(fence);
        var toggleFence = function (source, isFenced) {
            return fencer(source) ? !isFenced : isFenced;
        };
        return function parseBlock(source) {
            // start with description section
            var sections = [[]];
            var isFenced = false;
            for (var _i = 0, source_1 = source; _i < source_1.length; _i++) {
                var line = source_1[_i];
                if (reTag.test(line.tokens.description) && !isFenced) {
                    sections.push([line]);
                }
                else {
                    sections[sections.length - 1].push(line);
                }
                isFenced = toggleFence(line.tokens.description, isFenced);
            }
            return sections;
        };
    }
    function getFencer(fence) {
        if (typeof fence === 'string')
            return function (source) { return source.split(fence).length % 2 === 0; };
        return fence;
    }

    function getParser$2(_a) {
        var tokenizers = _a.tokenizers;
        return function parseSpec(source) {
            var _a;
            var spec = seedSpec({ source: source });
            for (var _i = 0, tokenizers_1 = tokenizers; _i < tokenizers_1.length; _i++) {
                var tokenize = tokenizers_1[_i];
                spec = tokenize(spec);
                if ((_a = spec.problems[spec.problems.length - 1]) === null || _a === void 0 ? void 0 : _a.critical)
                    break;
            }
            return spec;
        };
    }
    function tagTokenizer() {
        return function (spec) {
            var tokens = spec.source[0].tokens;
            var match = tokens.description.match(/\s*(@(\S+))(\s*)/);
            if (match === null) {
                spec.problems.push({
                    code: 'spec:tag:prefix',
                    message: 'tag should start with "@" symbol',
                    line: spec.source[0].number,
                    critical: true,
                });
                return spec;
            }
            tokens.tag = match[1];
            tokens.postTag = match[3];
            tokens.description = tokens.description.slice(match[0].length);
            spec.tag = match[2];
            return spec;
        };
    }
    function typeTokenizer() {
        return function (spec) {
            var _a;
            var res = '';
            var curlies = 0;
            var tokens = spec.source[0].tokens;
            var source = tokens.description.trimLeft();
            if (source[0] !== '{')
                return spec;
            for (var _i = 0, source_1 = source; _i < source_1.length; _i++) {
                var ch = source_1[_i];
                if (ch === '{')
                    curlies++;
                if (ch === '}')
                    curlies--;
                res += ch;
                if (curlies === 0) {
                    break;
                }
            }
            if (curlies !== 0) {
                spec.problems.push({
                    code: 'spec:type:unpaired-curlies',
                    message: 'unpaired curlies',
                    line: spec.source[0].number,
                    critical: true,
                });
                return spec;
            }
            spec.type = res.slice(1, -1);
            tokens.type = res;
            _a = splitSpace(source.slice(tokens.type.length)), tokens.postType = _a[0], tokens.description = _a[1];
            return spec;
        };
    }
    function nameTokenizer() {
        return function (spec) {
            var _a, _b;
            var _c;
            var tokens = spec.source[0].tokens;
            var source = tokens.description.trimLeft();
            var quotedGroups = source.split('"');
            // if it starts with quoted group, assume it is a literal
            if (quotedGroups.length > 1 &&
                quotedGroups[0] === '' &&
                quotedGroups.length % 2 === 1) {
                spec.name = quotedGroups[1];
                tokens.name = "\"" + quotedGroups[1] + "\"";
                _a = splitSpace(source.slice(tokens.name.length)), tokens.postName = _a[0], tokens.description = _a[1];
                return spec;
            }
            var brackets = 0;
            var name = '';
            var optional = false;
            var defaultValue;
            // assume name is non-space string or anything wrapped into brackets
            for (var _i = 0, source_2 = source; _i < source_2.length; _i++) {
                var ch = source_2[_i];
                if (brackets === 0 && isSpace(ch))
                    break;
                if (ch === '[')
                    brackets++;
                if (ch === ']')
                    brackets--;
                name += ch;
            }
            if (brackets !== 0) {
                spec.problems.push({
                    code: 'spec:name:unpaired-brackets',
                    message: 'unpaired brackets',
                    line: spec.source[0].number,
                    critical: true,
                });
                return spec;
            }
            var nameToken = name;
            if (name[0] === '[' && name[name.length - 1] === ']') {
                optional = true;
                name = name.slice(1, -1);
                var parts = name.split('=');
                name = parts[0].trim();
                defaultValue = (_c = parts[1]) === null || _c === void 0 ? void 0 : _c.trim();
                if (name === '') {
                    spec.problems.push({
                        code: 'spec:name:empty-name',
                        message: 'empty name',
                        line: spec.source[0].number,
                        critical: true,
                    });
                    return spec;
                }
                if (parts.length > 2) {
                    spec.problems.push({
                        code: 'spec:name:invalid-default',
                        message: 'invalid default value syntax',
                        line: spec.source[0].number,
                        critical: true,
                    });
                    return spec;
                }
                if (defaultValue === '') {
                    spec.problems.push({
                        code: 'spec:name:empty-default',
                        message: 'empty default value',
                        line: spec.source[0].number,
                        critical: true,
                    });
                    return spec;
                }
            }
            spec.optional = optional;
            spec.name = name;
            tokens.name = nameToken;
            if (defaultValue !== undefined)
                spec.default = defaultValue;
            _b = splitSpace(source.slice(tokens.name.length)), tokens.postName = _b[0], tokens.description = _b[1];
            return spec;
        };
    }
    function descriptionTokenizer(join) {
        return function (spec) {
            spec.description = join(spec.source);
            return spec;
        };
    }

    function getSpacer(spacing) {
        if (spacing === 'compact')
            return compactSpacer;
        if (spacing === 'preserve')
            return preserveSpacer;
        return spacing;
    }
    function compactSpacer(lines) {
        return lines
            .map(function (_a) {
            var description = _a.tokens.description;
            return description.trim();
        })
            .filter(function (description) { return description !== ''; })
            .join(' ');
    }
    function preserveSpacer(lines) {
        if (lines.length === 0)
            return '';
        if (lines[0].tokens.description === '' &&
            lines[0].tokens.delimiter === Markers.start)
            lines = lines.slice(1);
        var lastLine = lines[lines.length - 1];
        if (lastLine !== undefined &&
            lastLine.tokens.description === '' &&
            lastLine.tokens.end.endsWith(Markers.end))
            lines = lines.slice(0, -1);
        return lines
            .map(function (_a) {
            var tokens = _a.tokens;
            return (tokens.delimiter === ''
                ? tokens.start
                : tokens.postDelimiter.slice(1)) + tokens.description;
        })
            .join('\n');
    }

    function getParser$3(_a) {
        var _b = _a === void 0 ? {} : _a, _c = _b.startLine, startLine = _c === void 0 ? 0 : _c, _d = _b.fence, fence = _d === void 0 ? '```' : _d, _e = _b.spacing, spacing = _e === void 0 ? 'compact' : _e, _f = _b.tokenizers, tokenizers = _f === void 0 ? [
            tagTokenizer(),
            typeTokenizer(),
            nameTokenizer(),
            descriptionTokenizer(getSpacer(spacing)),
        ] : _f;
        if (startLine < 0 || startLine % 1 > 0)
            throw new Error('Invalid startLine');
        var parseSource = getParser({ startLine: startLine });
        var parseBlock = getParser$1({ fence: fence });
        var parseSpec = getParser$2({ tokenizers: tokenizers });
        var join = getSpacer(spacing);
        var notEmpty = function (line) {
            return line.tokens.description.trim() != '';
        };
        return function (source) {
            var blocks = [];
            for (var _i = 0, _a = splitLines(source); _i < _a.length; _i++) {
                var line = _a[_i];
                var lines = parseSource(line);
                if (lines === null)
                    continue;
                if (lines.find(notEmpty) === undefined)
                    continue;
                var sections = parseBlock(lines);
                var specs = sections.slice(1).map(parseSpec);
                blocks.push({
                    description: join(sections[0]),
                    tags: specs,
                    source: lines,
                    problems: specs.reduce(function (acc, spec) { return acc.concat(spec.problems); }, []),
                });
            }
            return blocks;
        };
    }

    var __assign$1 = (window && window.__assign) || function () {
        __assign$1 = Object.assign || function(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
            }
            return t;
        };
        return __assign$1.apply(this, arguments);
    };
    function getStringifier(_a) {
        var _b = (_a === void 0 ? {} : _a).format, format = _b === void 0 ? 'none' : _b;
        var formatter = getFormatter(format);
        return function (block) {
            return block.source
                .map(function (_a) {
                var tokens = _a.tokens;
                return formatter(tokens);
            })
                .reduce(function (acc, lines) { return acc.concat(lines); }, []) //flatmap
                .join('\n');
        };
    }
    function getFormatter(formatter) {
        if (formatter === 'none')
            return noneFormatter;
        if (formatter === 'align')
            return alignFormatter();
        return formatter;
    }
    function noneFormatter(tokens) {
        return [
            tokens.start +
                tokens.delimiter +
                tokens.postDelimiter +
                tokens.tag +
                tokens.postTag +
                tokens.type +
                tokens.postType +
                tokens.name +
                tokens.postName +
                tokens.description +
                tokens.end,
        ];
    }
    function alignFormatter() {
        var buffer = [];
        var zeroWidth = {
            start: 0,
            tag: 0,
            type: 0,
            name: 0,
        };
        var getWidth = function (w, t) { return ({
            start: t.delimiter === Markers.start ? t.start.length : w.start,
            tag: Math.max(w.tag, t.tag.length),
            type: Math.max(w.type, t.type.length),
            name: Math.max(w.name, t.name.length),
        }); };
        return function (tokens) {
            buffer.push(tokens);
            if (!tokens.end.endsWith(Markers.end))
                return [];
            // if (buffer.length === 1) {
            //   return [
            //     buffer[0].start +
            //       buffer[0].delimiter +
            //       buffer[0].postDelimiter +
            //       buffer[0].tag +
            //       buffer[0].postTag +
            //       buffer[0].type +
            //       buffer[0].postType +
            //       buffer[0].name +
            //       buffer[0].postName +
            //       buffer[0].description +
            //       buffer[0].end,
            //   ];
            // }
            var w = buffer.reduce(getWidth, __assign$1({}, zeroWidth));
            var postDelimiter = ' ';
            var lines = [];
            var intoTags = false;
            for (var _i = 0, buffer_1 = buffer; _i < buffer_1.length; _i++) {
                var t = buffer_1[_i];
                if (t.tag !== '')
                    intoTags = true;
                var isEmpty = t.tag === '' && t.name === '' && t.type === '' && t.description === '';
                // if it's a dangling '*/'
                if (t.end !== '' && isEmpty) {
                    lines.push(''.padStart(w.start + 1) + t.end);
                    continue;
                }
                var start = void 0, delimiter = void 0;
                switch (t.delimiter) {
                    case Markers.start:
                        start = ''.padStart(w.start);
                        delimiter = t.delimiter;
                        break;
                    case Markers.delim:
                        start = ''.padStart(w.start + 1);
                        delimiter = t.delimiter;
                        break;
                    default:
                        start = ''.padStart(w.start + 2);
                        delimiter = '';
                }
                // align the tag tokens or skip them if we haven't gotten into the tags yet
                var tag = intoTags
                    ? t.tag.padEnd(w.tag + 1) +
                        t.type.padEnd(w.type + 1) +
                        t.name.padEnd(w.name + 1)
                    : t.tag + t.type + t.name;
                var line = start + delimiter + postDelimiter + tag + t.description + t.end;
                lines.push(line.trimRight());
            }
            buffer = [];
            return lines;
        };
    }

    function parse(source, options) {
        if (options === void 0) { options = {}; }
        return getParser$3(options)(source);
    }
    function stringify(block, options) {
        if (options === void 0) { options = {}; }
        return getStringifier(options)(block);
    }

    exports.parse = parse;
    exports.stringify = stringify;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

}({}));
