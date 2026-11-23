# Graph Report - madrasati-rasd  (2026-11-23)

## Corpus Check
- 9 files · ~18,017 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: .zip 1)

## Summary
- 224 nodes · 523 edges · 14 communities
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8d368f8a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- attendance_tracker.js
- extension/attendance_tracker.js
- popup.js
- manifest.json
- engine.js
- content.js
- runSelected
- closingImage
- renderMap
- absence_addon.js
- renderPreview
- page_addon.js
- start
- أداة رصد الحضور — منصة مدرستي

## God Nodes (most connected - your core abstractions)
1. `runSelected()` - 20 edges
2. `renderPreview()` - 14 edges
3. `start()` - 14 edges
4. `_0x4b183d()` - 13 edges
5. `_0x4b183d()` - 13 edges
6. `closingImage()` - 12 edges
7. `showLog()` - 12 edges
8. `open()` - 11 edges
9. `scan()` - 11 edges
10. `_0x5012da()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `scan()` --indirect_call--> `fromYmd()`  [INFERRED]
  extension/engine.js → extension/engine.js  _Bridges community 10 → community 6_
- `runSelected()` --indirect_call--> `closingImage()`  [INFERRED]
  extension/engine.js → extension/engine.js  _Bridges community 7 → community 6_
- `followUp()` --calls--> `norm()`  [EXTRACTED]
  extension/engine.js → extension/engine.js  _Bridges community 4 → community 7_
- `renderPreview()` --calls--> `norm()`  [EXTRACTED]
  extension/engine.js → extension/engine.js  _Bridges community 4 → community 10_
- `closingImage()` --calls--> `fromYmd()`  [EXTRACTED]
  extension/engine.js → extension/engine.js  _Bridges community 10 → community 7_

## Import Cycles
- None detected.

## Communities (14 total, 0 thin omitted)

### Community 0 - "attendance_tracker.js"
Cohesion: 0.18
Nodes (30): _0x11fa70(), _0x194b52(), _0x1979ee(), _0x1c27bf(), _0x1de09f(), _0x20f2e1(), _0x2159a2(), _0x22be59() (+22 more)

### Community 1 - "extension/attendance_tracker.js"
Cohesion: 0.18
Nodes (30): _0x11fa70(), _0x194b52(), _0x1979ee(), _0x1c27bf(), _0x1de09f(), _0x20f2e1(), _0x2159a2(), _0x22be59() (+22 more)

### Community 2 - "popup.js"
Cohesion: 0.15
Nodes (28): activeTab(), busy(), chosenDates(), chosenSchools(), closeUI(), ensureClassroomsPage(), isMad(), loadSchools() (+20 more)

### Community 3 - "manifest.json"
Cohesion: 0.09
Nodes (21): action, default_icon, default_popup, default_title, content_scripts, 128, 16, 32 (+13 more)

### Community 4 - "engine.js"
Cohesion: 0.22
Nodes (15): catOf(), classesFromDom(), cleanName(), findTeacher(), getClassrooms(), isStatusGroup(), loadForm(), norm() (+7 more)

### Community 5 - "content.js"
Cohesion: 0.28
Nodes (17): close(), esc(), go(), mode(), nameIn(), open(), paintMode(), pick() (+9 more)

### Community 6 - "runSelected"
Cohesion: 0.21
Nodes (16): buildGroups(), chips(), getWeek(), notifyDone(), numericId(), pool(), primeAudio(), progress() (+8 more)

### Community 7 - "closingImage"
Cohesion: 0.21
Nodes (11): canvasToPdf(), closingImage(), deliverImage(), drawReport(), fdate(), followUp(), logLoad(), saveBlob() (+3 more)

### Community 8 - "renderMap"
Cohesion: 0.18
Nodes (11): attachPlans(), dayCat(), dayEntry(), deciderFor(), esc(), exceptions(), gkey(), nameHit() (+3 more)

### Community 9 - "absence_addon.js"
Cohesion: 0.33
Nodes (4): labelOf(), norm(), parseForm(), pickAbsent()

### Community 10 - "renderPreview"
Cohesion: 0.43
Nodes (7): fromYmd(), logSaveAll(), renderPreview(), count(), setAll(), saveLog(), visibleChecks()

### Community 11 - "page_addon.js"
Cohesion: 0.52
Nodes (5): labelOf(), norm(), parseForm(), pickAbsent(), readCfg()

### Community 12 - "start"
Cohesion: 0.50
Nodes (4): css(), keepAwake(), shell(), start()

### Community 13 - "أداة رصد الحضور — منصة مدرستي"
Cohesion: 0.50
Nodes (3): أداة رصد الحضور — منصة مدرستي, إضافة المتصفح (Chrome / Edge), الجديد في الإصدار 1.6

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderPreview()` connect `renderPreview` to `renderMap`, `engine.js`, `start`, `runSelected`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `_0x4b183d()` (e.g. with `_0x3e9c79()` and `_0x11fa70()`) actually correct?**
  _`_0x4b183d()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `popup.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14838709677419354 - nodes in this community are weakly interconnected._
- **Why does `runSelected()` connect `runSelected` to `engine.js`, `closingImage`, `renderMap`, `renderPreview`, `start`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `_0x4b183d()` (e.g. with `_0x3e9c79()` and `_0x11fa70()`) actually correct?**
  _`_0x4b183d()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Should `manifest.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._