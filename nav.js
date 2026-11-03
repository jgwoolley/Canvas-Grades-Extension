// Shared top navigation for the full-page views: Summary, plus the open course when on a course page.
(async () => {
    const nav = document.getElementById('nav');
    const stored = (await chrome.storage.local.get({ courses: {} })).courses;
    const page = location.pathname.split('/').pop();
    const id = new URLSearchParams(location.search).get('course');
    const course = page === 'course.html' ? (stored[id] ?? Object.values(stored)[0]) : null;

    const link = (href, text, active) => Object.assign(document.createElement('a'), {
        href, textContent: text, className: active ? 'active' : '',
    });
    const sep = Object.assign(document.createElement('span'), { className: 'sep' });
    nav.replaceChildren(
        link('summary.html', 'Summary', !course),
        ...(course ? [sep, link(location.href, courseName(course), true)] : []));
})();
