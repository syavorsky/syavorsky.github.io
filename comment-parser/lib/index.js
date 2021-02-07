var CommentParser = (function (exports) {
    'use strict';

    function isSpace(source) {
        return /^\s+$/.test(source);
    }
    function splitSpace(source) {
        const matches = source.match(/^\s+/);
        return matches == null
            ? ['', source]
            : [source.slice(0, matches[0].length), source.slice(matches[0].length)];
    }
    function splitLines(source) {
        return source.split(/\r?\n/);
    }
    function seedSpec(spec = {}) {
        return Object.assign({ tag: '', name: '', type: '', optional: false, description: '', problems: [], source: [] }, spec);
    }
    function seedTokens(tokens = {}) {
        return Object.assign({ start: '', delimiter: '', postDelimiter: '', tag: '', postTag: '', name: '', postName: '', type: '', postType: '', description: '', end: '' }, tokens);
    }
    /**
     * Assures Block.tags[].source contains references to the Block.source items,
     * using Block.source as a source of truth. This is a counterpart of rewireSpecs
     * @param block parsed coments block
     */
    function rewireSource(block) {
        const source = block.source.reduce((acc, line) => acc.set(line.number, line), new Map());
        for (const spec of block.tags) {
            spec.source = spec.source.map((line) => source.get(line.number));
        }
        return block;
    }

    const reTag = /^@\S+/;
    /**
     * Creates configured `Parser`
     * @param {Partial<Options>} options
     */
    function getParser({ fence = '```', } = {}) {
        const fencer = getFencer(fence);
        const toggleFence = (source, isFenced) => fencer(source) ? !isFenced : isFenced;
        return function parseBlock(source) {
            // start with description section
            const sections = [[]];
            let isFenced = false;
            for (const line of source) {
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
            return (source) => source.split(fence).length % 2 === 0;
        return fence;
    }

    var Markers;
    (function (Markers) {
        Markers["start"] = "/**";
        Markers["nostart"] = "/***";
        Markers["delim"] = "*";
        Markers["end"] = "*/";
    })(Markers || (Markers = {}));

    function getParser$1({ startLine = 0, } = {}) {
        let block = null;
        let num = startLine;
        return function parseSource(source) {
            let rest = source;
            const tokens = seedTokens();
            [tokens.start, rest] = splitSpace(rest);
            if (block === null &&
                rest.startsWith(Markers.start) &&
                !rest.startsWith(Markers.nostart)) {
                block = [];
                tokens.delimiter = rest.slice(0, Markers.start.length);
                rest = rest.slice(Markers.start.length);
                [tokens.postDelimiter, rest] = splitSpace(rest);
            }
            if (block === null) {
                num++;
                return null;
            }
            const isClosed = rest.trimRight().endsWith(Markers.end);
            if (tokens.delimiter === '' &&
                rest.startsWith(Markers.delim) &&
                !rest.startsWith(Markers.end)) {
                tokens.delimiter = Markers.delim;
                rest = rest.slice(Markers.delim.length);
                [tokens.postDelimiter, rest] = splitSpace(rest);
            }
            if (isClosed) {
                const trimmed = rest.trimRight();
                tokens.end = rest.slice(trimmed.length - Markers.end.length);
                rest = trimmed.slice(0, -Markers.end.length);
            }
            tokens.description = rest;
            block.push({ number: num, source, tokens });
            num++;
            if (isClosed) {
                const result = block.slice();
                block = null;
                return result;
            }
            return null;
        };
    }

    function getParser$2({ tokenizers }) {
        return function parseSpec(source) {
            var _a;
            let spec = seedSpec({ source });
            for (const tokenize of tokenizers) {
                spec = tokenize(spec);
                if ((_a = spec.problems[spec.problems.length - 1]) === null || _a === void 0 ? void 0 : _a.critical)
                    break;
            }
            return spec;
        };
    }

    /**
     * Splits the `@prefix` from remaining `Spec.lines[].token.descrioption` into the `tag` token,
     * and populates `spec.tag`
     */
    function tagTokenizer() {
        return (spec) => {
            const { tokens } = spec.source[0];
            const match = tokens.description.match(/\s*(@(\S+))(\s*)/);
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

    /**
     * Sets splits remaining `Spec.lines[].tokes.description` into `type` and `description`
     * tokens and populates Spec.type`
     *
     * @param {Spacing} spacing tells how to deal with a whitespace
     * for type values going over multiple lines
     */
    function typeTokenizer(spacing = 'compact') {
        const join = getJoiner(spacing);
        return (spec) => {
            let curlies = 0;
            let lines = [];
            for (const [i, { tokens }] of spec.source.entries()) {
                let type = '';
                if (i === 0 && tokens.description[0] !== '{')
                    return spec;
                for (const ch of tokens.description) {
                    if (ch === '{')
                        curlies++;
                    if (ch === '}')
                        curlies--;
                    type += ch;
                    if (curlies === 0)
                        break;
                }
                lines.push([tokens, type]);
                if (curlies === 0)
                    break;
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
            const parts = [];
            const offset = lines[0][0].postDelimiter.length;
            for (const [i, [tokens, type]] of lines.entries()) {
                if (type === '')
                    continue;
                tokens.type = type;
                if (i > 0) {
                    tokens.type = tokens.postDelimiter.slice(offset) + type;
                    tokens.postDelimiter = tokens.postDelimiter.slice(0, offset);
                }
                [tokens.postType, tokens.description] = splitSpace(tokens.description.slice(type.length));
                parts.push(tokens.type);
            }
            parts[0] = parts[0].slice(1);
            parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
            spec.type = join(parts);
            return spec;
        };
    }
    const trim = (x) => x.trim();
    function getJoiner(spacing) {
        if (spacing === 'compact')
            return (t) => t.map(trim).join('');
        else if (spacing === 'preserve')
            return (t) => t.join('\n');
        else
            return spacing;
    }

    const isQuoted = (s) => s && s.startsWith('"') && s.endsWith('"');
    /**
     * Splits remaining `spec.lines[].tokens.description` into `name` and `descriptions` tokens,
     * and populates the `spec.name`
     */
    function nameTokenizer() {
        const typeEnd = (num, { tokens }, i) => tokens.type === '' ? num : i;
        return (spec) => {
            // look for the name in the line where {type} ends
            const { tokens } = spec.source[spec.source.reduce(typeEnd, 0)];
            const source = tokens.description.trimLeft();
            const quotedGroups = source.split('"');
            // if it starts with quoted group, assume it is a literal
            if (quotedGroups.length > 1 &&
                quotedGroups[0] === '' &&
                quotedGroups.length % 2 === 1) {
                spec.name = quotedGroups[1];
                tokens.name = `"${quotedGroups[1]}"`;
                [tokens.postName, tokens.description] = splitSpace(source.slice(tokens.name.length));
                return spec;
            }
            let brackets = 0;
            let name = '';
            let optional = false;
            let defaultValue;
            // assume name is non-space string or anything wrapped into brackets
            for (const ch of source) {
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
            const nameToken = name;
            if (name[0] === '[' && name[name.length - 1] === ']') {
                optional = true;
                name = name.slice(1, -1);
                const parts = name.split('=');
                name = parts[0].trim();
                if (parts[1] !== undefined)
                    defaultValue = parts.slice(1).join('=').trim();
                if (name === '') {
                    spec.problems.push({
                        code: 'spec:name:empty-name',
                        message: 'empty name',
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
                // has "=" and is not a string, except for "=>"
                if (!isQuoted(defaultValue) && /=(?!>)/.test(defaultValue)) {
                    spec.problems.push({
                        code: 'spec:name:invalid-default',
                        message: 'invalid default value syntax',
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
            [tokens.postName, tokens.description] = splitSpace(source.slice(tokens.name.length));
            return spec;
        };
    }

    /**
     * Makes no changes to `spec.lines[].tokens` but joins them into `spec.description`
     * following given spacing srtategy
     * @param {Spacing} spacing tells how to handle the whitespace
     */
    function descriptionTokenizer(spacing = 'compact') {
        const join = getJoiner$1(spacing);
        return (spec) => {
            spec.description = join(spec.source);
            return spec;
        };
    }
    function getJoiner$1(spacing) {
        if (spacing === 'compact')
            return compactJoiner;
        if (spacing === 'preserve')
            return preserveJoiner;
        return spacing;
    }
    function compactJoiner(lines) {
        return lines
            .map(({ tokens: { description } }) => description.trim())
            .filter((description) => description !== '')
            .join(' ');
    }
    const lineNo = (num, { tokens }, i) => tokens.type === '' ? num : i;
    const getDescription = ({ tokens }) => (tokens.delimiter === '' ? tokens.start : tokens.postDelimiter.slice(1)) +
        tokens.description;
    function preserveJoiner(lines) {
        if (lines.length === 0)
            return '';
        // skip the opening line with no description
        if (lines[0].tokens.description === '' &&
            lines[0].tokens.delimiter === Markers.start)
            lines = lines.slice(1);
        // skip the closing line with no description
        const lastLine = lines[lines.length - 1];
        if (lastLine !== undefined &&
            lastLine.tokens.description === '' &&
            lastLine.tokens.end.endsWith(Markers.end))
            lines = lines.slice(0, -1);
        // description starts at the last line of type definition
        lines = lines.slice(lines.reduce(lineNo, 0));
        return lines.map(getDescription).join('\n');
    }

    function getParser$3({ startLine = 0, fence = '```', spacing = 'compact', tokenizers = [
        tagTokenizer(),
        typeTokenizer(spacing),
        nameTokenizer(),
        descriptionTokenizer(spacing),
    ], } = {}) {
        if (startLine < 0 || startLine % 1 > 0)
            throw new Error('Invalid startLine');
        const parseSource = getParser$1({ startLine });
        const parseBlock = getParser({ fence });
        const parseSpec = getParser$2({ tokenizers });
        const joinDescription = getJoiner$1(spacing);
        const notEmpty = (line) => line.tokens.description.trim() != '';
        return function (source) {
            const blocks = [];
            for (const line of splitLines(source)) {
                const lines = parseSource(line);
                if (lines === null)
                    continue;
                if (lines.find(notEmpty) === undefined)
                    continue;
                const sections = parseBlock(lines);
                const specs = sections.slice(1).map(parseSpec);
                blocks.push({
                    description: joinDescription(sections[0]),
                    tags: specs,
                    source: lines,
                    problems: specs.reduce((acc, spec) => acc.concat(spec.problems), []),
                });
            }
            return blocks;
        };
    }

    function join(tokens) {
        return (tokens.start +
            tokens.delimiter +
            tokens.postDelimiter +
            tokens.tag +
            tokens.postTag +
            tokens.type +
            tokens.postType +
            tokens.name +
            tokens.postName +
            tokens.description +
            tokens.end);
    }
    function getStringifier() {
        return (block) => block.source.map(({ tokens }) => join(tokens)).join('\n');
    }

    var __rest = (window && window.__rest) || function (s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    };
    const zeroWidth = {
        start: 0,
        tag: 0,
        type: 0,
        name: 0,
    };
    const getWidth = (w, { tokens: t }) => ({
        start: t.delimiter === Markers.start ? t.start.length : w.start,
        tag: Math.max(w.tag, t.tag.length),
        type: Math.max(w.type, t.type.length),
        name: Math.max(w.name, t.name.length),
    });
    const space = (len) => ''.padStart(len, ' ');
    function align() {
        let intoTags = false;
        let w;
        function update(line) {
            const tokens = Object.assign({}, line.tokens);
            if (tokens.tag !== '')
                intoTags = true;
            const isEmpty = tokens.tag === '' &&
                tokens.name === '' &&
                tokens.type === '' &&
                tokens.description === '';
            // dangling '*/'
            if (tokens.end === Markers.end && isEmpty) {
                tokens.start = space(w.start + 1);
                return Object.assign(Object.assign({}, line), { tokens });
            }
            switch (tokens.delimiter) {
                case Markers.start:
                    tokens.start = space(w.start);
                    break;
                case Markers.delim:
                    tokens.start = space(w.start + 1);
                    break;
                default:
                    tokens.delimiter = '';
                    tokens.start = space(w.start + 2); // compensate delimiter
            }
            if (!intoTags) {
                tokens.postDelimiter = tokens.description === '' ? '' : ' ';
                return Object.assign(Object.assign({}, line), { tokens });
            }
            const nothingAfter = {
                delim: false,
                tag: false,
                type: false,
                name: false,
            };
            if (tokens.description === '') {
                nothingAfter.name = true;
                tokens.postName = '';
                if (tokens.name === '') {
                    nothingAfter.type = true;
                    tokens.postType = '';
                    if (tokens.type === '') {
                        nothingAfter.tag = true;
                        tokens.postTag = '';
                        if (tokens.tag === '') {
                            nothingAfter.delim = true;
                        }
                    }
                }
            }
            tokens.postDelimiter = nothingAfter.delim ? '' : ' ';
            if (!nothingAfter.tag)
                tokens.postTag = space(w.tag - tokens.tag.length + 1);
            if (!nothingAfter.type)
                tokens.postType = space(w.type - tokens.type.length + 1);
            if (!nothingAfter.name)
                tokens.postName = space(w.name - tokens.name.length + 1);
            return Object.assign(Object.assign({}, line), { tokens });
        }
        return (_a) => {
            var { source } = _a, fields = __rest(_a, ["source"]);
            w = source.reduce(getWidth, Object.assign({}, zeroWidth));
            return rewireSource(Object.assign(Object.assign({}, fields), { source: source.map(update) }));
        };
    }

    var __rest$1 = (window && window.__rest) || function (s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    };
    const pull = (offset) => (str) => str.slice(offset);
    const push = (offset) => {
        const space = ''.padStart(offset, ' ');
        return (str) => str + space;
    };
    function indent(pos) {
        let shift;
        const pad = (start) => {
            if (shift === undefined) {
                const offset = pos - start.length;
                shift = offset > 0 ? push(offset) : pull(-offset);
            }
            return shift(start);
        };
        const update = (line) => (Object.assign(Object.assign({}, line), { tokens: Object.assign(Object.assign({}, line.tokens), { start: pad(line.tokens.start) }) }));
        return (_a) => {
            var { source } = _a, fields = __rest$1(_a, ["source"]);
            return rewireSource(Object.assign(Object.assign({}, fields), { source: source.map(update) }));
        };
    }

    function flow(...transforms) {
        return (block) => transforms.reduce((block, t) => t(block), block);
    }

    const zeroWidth$1 = {
        line: 0,
        start: 0,
        delimiter: 0,
        postDelimiter: 0,
        tag: 0,
        postTag: 0,
        name: 0,
        postName: 0,
        type: 0,
        postType: 0,
        description: 0,
        end: 0,
    };
    const fields = Object.keys(zeroWidth$1);
    const repr = (x) => (isSpace(x) ? `{${x.length}}` : x);
    const frame = (line) => '|' + line.join('|') + '|';
    const align$1 = (width, tokens) => Object.keys(tokens).map((k) => repr(tokens[k]).padEnd(width[k]));
    function inspect({ source }) {
        if (source.length === 0)
            return '';
        const width = Object.assign({}, zeroWidth$1);
        for (const f of fields)
            width[f] = f.length;
        for (const { number, tokens } of source) {
            width.line = Math.max(width.line, number.toString().length);
            for (const k in tokens)
                width[k] = Math.max(width[k], repr(tokens[k]).length);
        }
        const lines = [[], []];
        for (const f of fields)
            lines[0].push(f.padEnd(width[f]));
        for (const f of fields)
            lines[1].push('-'.padEnd(width[f], '-'));
        for (const { number, tokens } of source) {
            const line = number.toString().padStart(width.line);
            lines.push([line, ...align$1(width, tokens)]);
        }
        return lines.map(frame).join('\n');
    }

    function parse(source, options = {}) {
        return getParser$3(options)(source);
    }
    const stringify = getStringifier();
    const transforms = {
        flow: flow,
        align: align,
        indent: indent,
    };
    const tokenizers = {
        tag: tagTokenizer,
        type: typeTokenizer,
        name: nameTokenizer,
        description: descriptionTokenizer,
    };

    exports.inspect = inspect;
    exports.parse = parse;
    exports.stringify = stringify;
    exports.tokenizers = tokenizers;
    exports.transforms = transforms;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

}({}));
