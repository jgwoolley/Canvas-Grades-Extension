const $ = id => document.getElementById(id);
let courses = [];
let sort = { key: null, desc: false };
let groupFilter = null;
let currentId = '';

const pct = f => (f == null || !Number.isFinite(f)) ? '–' : `${(Math.round(f * 1000) / 10).toFixed(1)}%`;

function rowsFor(course) {
    return course.grades.map(a => ({ ...a, percent: a.score != null && a.total ? a.score / a.total : null }));
}

function render() {
    const course = courses.find(c => String(c.courseId) === currentId);
    if (!course) return;
    const r = computeCourse(course.grades, course.groups);
    $('title').textContent = courseName(course);
    document.title = `${courseName(course)} – parsed assignments`;
    $('meta').textContent = `${course.grades.length} assignments · current ${pct(r.current)} (${r.letter}) · captured ${new Date(course.capturedAt).toLocaleString()}`;

    renderGroups(r);
    renderNotices(r);

    const q = $('filter').value.toLowerCase();
    const state = $('state').value;
    let rows = rowsFor(course).filter(a =>
        (groupFilter == null || a.context === groupFilter) &&
        (!q || `${a.name} ${a.context}`.toLowerCase().includes(q)) &&
        (state === 'all' || (state === 'graded') === (a.score != null && !isIncomplete(a))));

    if (sort.key) {
        const dir = sort.desc ? -1 : 1;
        rows.sort((a, b) => {
            const x = a[sort.key], y = b[sort.key];
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
        });
    }

    const body = document.querySelector('#table tbody');
    body.replaceChildren(...rows.map(a => {
        const tr = document.createElement('tr');
        const partial = isIncomplete(a);
        if (a.score == null || partial) tr.className = 'pending';
        if (a.total == null) tr.classList.add('warn');
        const link = Object.assign(document.createElement('a'), { href: a.href, target: '_blank', rel: 'noopener noreferrer', textContent: a.name });
        const cells = [
            [link, ''],
            [a.context || '', ''],
            [`${a.score ?? '–'} / ${a.total ?? '?'}${partial ? ' (partial)' : ''}`, 'num'],
            [partial ? 'not counted' : pct(a.percent), 'num'],
            [a.dueDate || '', ''],
            [a.submittedDate || '', ''],
        ];
        for (const [content, cls] of cells) {
            const td = document.createElement('td');
            td.className = cls;
            td.append(content);
            tr.append(td);
        }
        return tr;
    }));
    $('empty').hidden = rows.length > 0;
    document.querySelectorAll('th').forEach(th => {
        th.classList.toggle('sorted', th.dataset.key === sort.key);
        th.classList.toggle('desc', th.dataset.key === sort.key && sort.desc);
    });
}

function renderNotices(r) {
    const box = $('notices');
    const sections = [
        ['Not counted yet (partly graded or grade not posted)', r.partial],
        ['Parse warnings', r.warnings],
    ].filter(([, items]) => items.length);
    box.hidden = sections.length === 0;
    box.replaceChildren(...sections.flatMap(([title, items]) => {
        const h = document.createElement('h2');
        h.textContent = title;
        const ul = document.createElement('ul');
        for (const t of items) ul.append(Object.assign(document.createElement('li'), { textContent: t }));
        return [h, ul];
    }));
}

function renderGroups(r) {
    const tile = (value, label, secondary = false) => {
        const d = document.createElement('div');
        d.className = secondary ? 'tile secondary' : 'tile';
        const b = document.createElement('b');
        b.textContent = value;
        const s = document.createElement('span');
        s.textContent = label;
        d.append(b, s);
        return d;
    };
    const hasRange = r.ungradedCount > 0 && r.best != null;
    $('summary').replaceChildren(
        tile(`${pct(r.current)} ${r.letter}`, 'Current (graded work only)'),
        ...(hasRange ? [
            tile(`${pct(r.worst)} ${letterFor(r.worst)}`, 'If remaining work scores 0', true),
            tile(`${pct(r.best)} ${letterFor(r.best)}`, 'If remaining work scores full', true),
        ] : []));

    const body = document.querySelector('#groups tbody');
    body.replaceChildren(...r.groups.map(g => {
        const tr = document.createElement('tr');
        tr.classList.toggle('active', groupFilter === g.name);
        const cells = [
            [g.name, ''], [r.weighted ? pct(g.weight) : '–', 'num'], [g.graded, 'num'], [g.ungraded, 'num'],
            [`${+g.earned.toFixed(2)} / ${+g.possible.toFixed(2)}`, 'num'], [pct(g.percent), 'num'],
        ];
        for (const [v, cls] of cells) {
            const td = document.createElement('td');
            td.className = cls;
            td.textContent = v;
            tr.append(td);
        }
        tr.addEventListener('click', () => { groupFilter = groupFilter === g.name ? null : g.name; render(); });
        return tr;
    }));
}

async function init() {
    courses = Object.values((await chrome.storage.local.get({ courses: {} })).courses)
        .sort((a, b) => courseName(a).localeCompare(courseName(b)));
    const wanted = new URLSearchParams(location.search).get('course');
    currentId = courses.some(c => String(c.courseId) === wanted) ? wanted : String(courses[0]?.courseId ?? '');
    if (!courses.length) $('title').textContent = 'No courses captured yet';

    $('filter').addEventListener('input', render);
    $('state').addEventListener('change', render);
    document.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
        sort = { key: th.dataset.key, desc: sort.key === th.dataset.key && !sort.desc };
        render();
    }));
    render();
}
init();
