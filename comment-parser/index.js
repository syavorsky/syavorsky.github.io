(function playground() {

  const updateDelay = 1000;
  const { parse, stringify, transforms } = CommentParser;
  const nav = examples.reduce((nav, example) => ({
    ...nav, [name2hash(example.name)]: example
  }), {})

  const editorConfig = {
    lineWrapping: true,
    lineNumbers: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
  };
  const editorConfigRO = { ...editorConfig, readOnly: true, theme: 'readonly' };

  const sourcePane = document.querySelector('.ed-source')
  const edSource = CodeMirror.fromTextArea(
    document.querySelector('.ed-source textarea'),
    editorConfig
  );
  const edParsed = CodeMirror.fromTextArea(
    document.querySelector('.ed-parsed textarea'),
    editorConfigRO
  );
  const edStringified = CodeMirror.fromTextArea(
    document.querySelector('.ed-stringified textarea'),
    editorConfigRO
  );

  function sourceMessage(message) {
    if (!message) return sourcePane.removeAttribute('data-message')
    sourcePane.setAttribute('data-message', message)
  }

  function foldOn(ed, field) {
    ed.eachLine((line) => {
      const matched = line.text.match(new RegExp(`\\s+${field}:`));
      if (matched) ed.foldCode(CodeMirror.Pos(line.lineNo()));
    });
  }

  function showParsed(result) {
    parsed = JSON.stringify(result, null, 2).replace(/'([^']+)':/g, '$1:');
    edParsed.setValue(parsed);
    foldOn(edParsed, 'source');
    foldOn(edParsed, 'tags');
    return result;
  }

  function showStringified(result) {
    if (Array.isArray(result)) result = result.join('\n\n')
    edStringified.setValue(result);
    return result;
  }

  function runExample(source) {
    try {
      const example = new Function(['source', 'parse', 'stringify', 'transforms', 'showParsed', 'showStringified'], source.trim());
      example(source, parse, stringify, transforms, showParsed, showStringified);
      sourceMessage('')
    } catch (err) {
      console.log('source is not valid:', err);
      console.log(source);
      sourceMessage(err.message)
    }
  }

  function loadExample(example) {
    const lines = example.toString().split(/\r?\n/)
      .slice(1, -1)
      .map((line) => line.slice(2))
      .concat(['', 'showParsed(parsed)', 'showStringified(stringified)'])
    
    const source = lines.join('\n')
    edSource.setValue(source);

    let notesRange, inNotes = false
    edSource.eachLine((line) => {
      const lineNo = line.lineNo()
      const isComment = line.text.startsWith('//')
      if (lineNo === 0 && isComment) inNotes = true
      if (inNotes && !isComment) inNotes = false
      if (inNotes) notesRange = [lineNo, line.text.length]
    });
    if (notesRange) {
      edSource.markText(
        CodeMirror.Pos(0, 0), 
        CodeMirror.Pos(...notesRange), 
        {readOnly: true, className: 'readonly-code notes-code'}
      )
    }

    edSource.markText(
      CodeMirror.Pos(lines.length - 2, 0), 
      CodeMirror.Pos(lines.length - 1, lines[lines.length - 1].length), 
      {readOnly: true, className: 'readonly-code'}
    )
    runExample(source);
  }

  function name2title(name) {
    return name
      .replace(/_/g, ' ')
      .replace(/^(parse|stringify) /, '$1() - ')
  }

  function name2hash(name) {
    return name.replace(/_/g, '-')
  }

  function gotoExample({name}) {
    console.log('go to', name)
    window.location.hash = '#' + name2hash(name)
  }

  let lastSource;
  setInterval(function onInterval () {
    const source = edSource.getValue();
    if (source === lastSource) return;
    lastSource = source;
    runExample(source);
  }, updateDelay);

  window.addEventListener('hashchange', e => {
    const example = nav[location.hash.slice(1)]
    console.log('load', example)
    loadExample(example)
  });
  
  let currentExample = nav[location.hash.slice(1)] 
  let init = loadExample
  if (!currentExample) {
    currentExample = examples[0]
    init = gotoExample
  }
  
  const select = examples.reduce((select, {name}, i) => {
    const option = document.createElement('option')
    option.innerText = name2title(name)
    select.appendChild(option)
    if (name === currentExample.name) select.selectedIndex = i
    return select
  }, document.querySelector('select.ed-title'))
  
  select.addEventListener('change', e => {
    gotoExample(examples[e.target.selectedIndex])
  })  

  init(currentExample);

})();
