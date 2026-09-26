const fs = require('fs');
const path = require('path');

const action = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

const editorRoot = path.resolve(__dirname, '../../my_editor');

function getFullPath(relPath) {
  if (path.isAbsolute(relPath)) return relPath;
  return path.resolve(editorRoot, relPath);
}

if (action === 'read') {
  const filePath = getFullPath(arg1);
  const startLine = arg2 ? parseInt(arg2, 10) : 1;
  const endLine = process.argv[5] ? parseInt(process.argv[5], 10) : 10000;
  
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const sliced = lines.slice(startLine - 1, endLine);
  sliced.forEach((line, idx) => {
    console.log(`${startLine + idx}: ${line}`);
  });
} else if (action === 'write') {
  const filePath = getFullPath(arg1);
  const content = fs.readFileSync(0, 'utf8'); // read stdin
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
} else if (action === 'list') {
  const dirPath = getFullPath(arg1 || '.');
  const files = fs.readdirSync(dirPath);
  console.log(files.join('\n'));
} else if (action === 'search') {
  const relPath = arg1 || 'lib';
  const query = arg2;
  const targetDir = getFullPath(relPath);

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.dart')) {
        const text = fs.readFileSync(full, 'utf8');
        const lines = text.split('\n');
        lines.forEach((line, i) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            console.log(`${path.relative(editorRoot, full)}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
  walk(targetDir);
} else if (action === 'copy-from') {
  // copies a file from backend to editorRoot
  const src = path.resolve(__dirname, arg1);
  const dest = getFullPath(arg2);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} -> ${dest}`);
} else {
  console.log('Usage: node flutter_tool.cjs <read|write|list|search|copy-from> <path> [args]');
}
