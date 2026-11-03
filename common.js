// Shared by popup.js and summary.js. Needs grading.js loaded first.
const $ = id => document.getElementById(id);
const pct = f => (f == null || !Number.isFinite(f)) ? '–' : `${(Math.round(f * 1000) / 10).toFixed(1)}%`;

/** @returns {Promise<Record<string, any>>} courses keyed by id */
async function loadCourses() {
    return (await chrome.storage.local.get({ courses: {} })).courses;
}

/** Temporarily swap a button's label to acknowledge a click. */
function flash(btn, text = 'Done ✓', ms = 2000) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    clearTimeout(btn._flashTimer);
    btn.textContent = text;
    btn.classList.add('flashed');
    btn._flashTimer = setTimeout(() => {
        btn.textContent = btn.dataset.label;
        btn.classList.remove('flashed');
    }, ms);
}

function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
}

function ago(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
}

function courseCard(course, { full = false, onRemoved } = {}) {
    const r = computeCourse(course.grades, course.groups);
    const hasRange = r.best != null && r.worst != null && r.ungradedCount > 0;

    const card = el('div', { className: 'card' });
    card.append(el('div', { className: 'card-head' },
        el('div', {},
            el('div', { className: 'course-name', textContent: courseName(course) }),
            el('div', { className: 'muted', textContent: `${r.gradedCount} graded · ${r.ungradedCount} pending · ${ago(course.capturedAt)}` })),
        el('div', { className: 'big' }, pct(r.current), el('small', { textContent: r.letter }))));

    if (r.current != null) {
        const bar = el('div', { className: 'bar' });
        if (hasRange) {
            bar.append(el('div', { className: 'span', style: `left:${r.worst * 100}%;width:${(r.best - r.worst) * 100}%` }));
        }
        bar.append(el('div', { className: 'now', style: `left:calc(${Math.min(r.current, 1) * 100}% - 1px)` }));
        card.append(bar);
    }
    if (hasRange) {
        card.append(el('div', { className: 'range' },
            el('span', { textContent: `If rest = 0: ${pct(r.worst)} (${letterFor(r.worst)})` }),
            el('span', { textContent: `If rest = full: ${pct(r.best)} (${letterFor(r.best)})` })));
    }
    if (course.canvasReportedGrade) {
        card.append(el('div', { className: 'muted', textContent: `Canvas shows: ${course.canvasReportedGrade}` }));
    }
    if (full) {
        if (r.partial.length) card.append(el('div', { className: 'warn', textContent: `◐ Not counted yet: ${r.partial.join('; ')}` }));
        const table = el('table', {}, el('tr', {},
            ...['Group', r.weighted ? 'Weight' : '', 'Graded', 'Pts', 'Grade'].map(t => el('th', { textContent: t }))));
        for (const g of r.groups) {
            table.append(el('tr', {},
                el('td', { textContent: g.name }),
                el('td', { textContent: r.weighted ? pct(g.weight) : '' }),
                el('td', { textContent: `${g.graded}/${g.graded + g.ungraded}` }),
                el('td', { textContent: `${+g.earned.toFixed(2)}/${+g.possible.toFixed(2)}` }),
                el('td', { textContent: pct(g.percent) })));
        }
        card.append(table);
    }
    card.append(el('div', { className: 'card-actions' },
        el('button', { textContent: 'Open', title: 'Open this course\'s grades page', onclick: () => chrome.tabs.create({ url: course.url }) }),
        el('button', { textContent: full ? 'Course page' : `Assignments (${course.grades.length})`, title: 'Open all parsed assignments in a full page',
            onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL(`course.html?course=${course.courseId}`) }) }),
        el('button', { textContent: 'Raw', title: 'Download latest raw capture for this course', onclick: e => { downloadRaw([course]); flash(e.target, 'Downloaded ✓'); } }),
        el('button', { className: 'danger', textContent: 'Remove', onclick: async () => {
            const courses = await loadCourses();
            delete courses[course.courseId];
            await chrome.storage.local.set({ courses });
            onRemoved?.(course);
        } })));
    return card;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadJson(obj, filename) {
    downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

/** Raw HTML snapshot + parsed rows + computed estimate, so a reviewer can diff parse vs. source. */
function downloadRaw(courses) {
    downloadJson({
        schema: 'canvas-grade-raw/1',
        exportedAt: new Date().toISOString(),
        instructions: 'For each course compare raw.rows (each table row: text + html; parsedAsAssignment says whether the parser used it), raw.groupsHtml and raw.pageText with parsed.grades / parsed.groups, and check estimate against canvasReportedGrade. Report any mismatches (missing rows, wrong scores/totals, wrong group names or weights).',
        courses: courses.map(c => {
            const { raw, grades, groups, ...meta } = c;
            meta.name = courseName(c);
            const { groups: breakdown, ...estimate } = computeCourse(grades, groups);
            return { ...meta, estimate: { ...estimate, groups: breakdown }, parsed: { grades, groups }, raw };
        }),
    }, courses.length === 1 ? `canvas_raw_${courses[0].courseId}.json` : 'canvas_raw_all.json');
}


function wireExports() {
    $('download-raw').addEventListener('click', async e => {
        flash(e.target, 'Downloaded ✓');
        downloadRaw(Object.values(await loadCourses()));
    });
    $('download-json').addEventListener('click', async e => {
        flash(e.target, 'Saved ✓');
        const courses = Object.values(await loadCourses()).map(({ raw, ...c }) => ({ ...c, estimate: computeCourse(c.grades, c.groups) }));
        downloadJson({ courses }, 'canvas_grades.json');
    });
    $('download-csv').addEventListener('click', async e => {
        flash(e.target, 'Saved ✓');
        const headers = ['course', 'name', 'context', 'score', 'total', 'dueDate', 'submittedDate', 'href'];
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [];
        for (const c of Object.values(await loadCourses())) {
            for (const a of c.grades) rows.push(headers.map(h => q(h === 'course' ? courseName(c) : a[h])).join(','));
        }
        downloadBlob(new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }), 'canvas_grades.csv');
    });
}
