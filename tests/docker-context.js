const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

const escapeRegex = (s) => s.replace(/[.+^${}()|[\]\\?]/g, '\\$&')

function parseDockerignore(text) {
   const rules = []
   for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      if (line.startsWith('!')) {
         throw new Error(`dockerignore com negação não suportada pela guarda: ${line}`)
      }
      rules.push(line)
   }
   return rules
}

function isExcluded(rules, relPath) {
   const normalized = relPath.split(path.sep).join('/')
   const segments = normalized.split('/')
   const targets = []
   for (let i = 1; i <= segments.length; i++) {
      targets.push(segments.slice(0, i).join('/'))
   }

   for (const target of targets) {
      const basename = target.includes('/')
         ? target.slice(target.lastIndexOf('/') + 1)
         : target
      for (const rule of rules) {
         const dirOnly = rule.endsWith('/')
         const body = dirOnly ? rule.slice(0, -1) : rule
         const anchored = body.includes('/')
         const rx = new RegExp(`^${escapeRegex(body).split('*').join('[^/]*')}${dirOnly ? '(/.*)?$' : '$'}`)
         if (rx.test(anchored ? target : basename)) {
            return { excluded: true, rule }
         }
      }
   }
   return { excluded: false, rule: null }
}

function resolveRequire(baseDir, spec) {
   const abs = path.resolve(baseDir, spec)
   if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return [abs]
   if (fs.existsSync(abs + '.js')) return [abs + '.js']
   if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const index = path.join(abs, 'index.js')
      if (!fs.existsSync(index)) return []
      const inside = fs
         .readdirSync(abs)
         .filter((f) => f.endsWith('.js') || f.endsWith('.json'))
         .map((f) => path.join(abs, f))
      return [index, ...inside]
   }
   return []
}

function expandGlob(baseDir, spec) {
   let abs = path.resolve(baseDir, spec)
   if (!fs.existsSync(path.dirname(abs))) {
      abs = path.resolve(repoRoot, spec)
   }
   const dir = path.dirname(abs)
   const rx = new RegExp(`^${path.basename(abs).split('*').map(escapeRegex).join('.*')}$`)
   return fs
      .readdirSync(dir)
      .filter((f) => rx.test(f) && fs.statSync(path.join(dir, f)).isFile())
      .map((f) => path.join(dir, f))
}

function collectRuntimeFiles(entries = ['server.js']) {
   const seen = new Set()
   const queue = entries.map((e) => path.resolve(repoRoot, e))

   while (queue.length) {
      const file = queue.pop()
      if (seen.has(file)) continue
      seen.add(file)

      const text = fs.readFileSync(file, 'utf8')
      const baseDir = path.dirname(file)
      for (const match of text.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
         const spec = match[1]
         const resolved = spec.includes('*')
            ? expandGlob(baseDir, spec)
            : resolveRequire(baseDir, spec)
         for (const r of resolved) queue.push(r)
      }
      for (const match of text.matchAll(/['"](\.[^'"]*\*[^'"]*)['"]/g)) {
         for (const r of expandGlob(baseDir, match[1])) queue.push(r)
      }
   }

   return [...seen]
      .map((f) => path.relative(repoRoot, f).split(path.sep).join('/'))
      .sort()
}

module.exports = { repoRoot, parseDockerignore, isExcluded, collectRuntimeFiles }
