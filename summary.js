async function render() {
    const courses = Object.values(await loadCourses()).sort((a, b) => courseName(a).localeCompare(courseName(b)));
    const body = document.querySelector('#courses tbody');
    body.replaceChildren(...courses.map(courseRow));
    $('empty').hidden = courses.length > 0;
    $('courses').hidden = courses.length === 0;
    $('summary-line').textContent = courses.length ? `${courses.length} course${courses.length === 1 ? '' : 's'} saved` : '';
    $('export-controls').style.display = courses.length ? 'flex' : 'none';
}

function courseRow(course) {
    const r = computeCourse(course.grades, course.groups);
    const hasRange = r.best != null && r.worst != null && r.ungradedCount > 0;
    const tr = el('tr');
    const cell = (content, cls = '') => tr.append(el('td', { className: cls }, content));

    cell(el('a', { href: `course.html?course=${course.courseId}`, textContent: courseName(course), title: 'Open course page' }), 'name');
    cell(pct(r.current), 'num grade');
    cell(r.letter, 'num');
    cell(hasRange ? `${pct(r.worst)} – ${pct(r.best)}` : '', 'num muted');
    cell(course.canvasReportedGrade || '', 'num muted');
    cell(`${r.gradedCount} / ${r.gradedCount + r.ungradedCount}`, 'num');
    cell(r.partial.length || r.warnings.length ? `⚠ ${r.partial.length + r.warnings.length}` : '', 'num warn-cell');
    cell(ago(course.capturedAt), 'muted');
    cell(el('span', { className: 'row-actions' },
        el('button', { textContent: 'Open in Canvas', onclick: () => chrome.tabs.create({ url: course.url }) }),
        el('button', { textContent: 'Raw', title: 'Download latest raw capture for this course', onclick: e => { downloadRaw([course]); flash(e.target, 'Downloaded ✓'); } }),
        el('button', { className: 'danger', textContent: 'Remove', onclick: async () => {
            const courses = await loadCourses();
            delete courses[course.courseId];
            await chrome.storage.local.set({ courses });
            render();
        } })));
    return tr;
}

$('clear-all').addEventListener('click', async () => {
    if (!confirm('Delete all saved courses and raw captures?')) return;
    await chrome.storage.local.set({ courses: {} });
    render();
});

wireExports();
render();
