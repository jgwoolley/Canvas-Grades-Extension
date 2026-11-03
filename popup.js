/** @typedef {import("./types.js").Assignment} Assignment */
/** @typedef {import("./types.js").Group} Group */

function setStatus(text, kind = '') {
    const el = $('status');
    el.textContent = text;
    el.className = kind;
}

function gradesUrlFromTabUrl(tabUrl) {
    try {
        const url = new URL(tabUrl);
        const match = url.pathname.match(/^\/courses\/(\d+)/);
        return match ? `${url.origin}/courses/${match[1]}/grades` : null;
    } catch (e) {
        return null;
    }
}

/** Store parsed + raw data for the course on the page, replacing any earlier capture. */
async function saveCapture(data, tabUrl) {
    const store = await chrome.storage.local.get({ courses: {}, courseNames: {} });

    for (const c of data.courses || []) store.courseNames[c.courseId] = c.courseName;

    const id = data.course?.courseId;
    const onGrades = id && data.grades.length > 0;
    if (onGrades) {
        store.courses[id] = {
            courseId: id,
            name: data.course.name,
            url: tabUrl,
            capturedAt: new Date().toISOString(),
            canvasReportedGrade: data.course.canvasReportedGrade,
            grades: data.grades,
            groups: data.groups,
            raw: data.raw, // latest raw snapshot only: overwritten on each capture
        };
    }
    await chrome.storage.local.set({ courses: store.courses, courseNames: store.courseNames });
    return onGrades ? store.courses[id] : null;
}

async function capture(auto = false) {
    if (!auto) flash($('parse-btn'), 'Capturing…', 1200);
    $('grade-link-container').style.display = 'none';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url || (!tab.url.includes('instructure.com') && !tab.url.includes('canvas'))) {
        if (!auto) setStatus('Go to a Canvas grades page first.', 'error');
        return;
    }
    const gradesUrl = gradesUrlFromTabUrl(tab.url);
    const onGradesPage = /\/courses\/\d+\/grades/.test(tab.url);
    if (auto && !onGradesPage) {
        showGradesLink(gradesUrl);
        return;
    }

    try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    } catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getGrades' }, async response => {
        if (!response?.data) {
            setStatus('Could not read this page. Reload it and try again.', 'error');
            showGradesLink(gradesUrl);
            return;
        }
        const saved = await saveCapture(response.data, tab.url);
        await render();
        if (saved) {
            flash($('parse-btn'), 'Saved ✓');
            setStatus(`Saved ${courseName(saved)} (${saved.grades.length} assignments). Switch to another course and capture again to add it.`, 'ok');
        } else if (response.data.courses?.length) {
            setStatus(`Remembered ${response.data.courses.length} course names. Open each course's Grades page to capture its grades.`);
        } else {
            flash($('parse-btn'), 'Nothing found');
            setStatus('No grades found on this page.', 'error');
            showGradesLink(gradesUrl);
        }
    });
}

function showGradesLink(url) {
    if (!url) return;
    $('grade-link').href = url;
    $('grade-link-container').style.display = 'block';
}

async function render() {
    const courses = Object.values(await loadCourses()).sort((a, b) => courseName(a).localeCompare(courseName(b)));
    const box = $('courses');
    box.replaceChildren();
    if (!courses.length) box.append(el('div', { className: 'empty', textContent: 'No courses captured yet.' }));
    for (const c of courses) box.append(courseCard(c, { onRemoved: async c => { await render(); setStatus(`Removed ${courseName(c)}.`); } }));
    $('summary-line').textContent = courses.length ? `${courses.length} course${courses.length === 1 ? '' : 's'} saved` : '';
    $('export-controls').style.display = courses.length ? 'flex' : 'none';
}

$('parse-btn').addEventListener('click', () => capture(false));
$('clear-all').addEventListener('click', async () => {
    if (!confirm('Delete all saved courses and raw captures?')) return;
    await chrome.storage.local.set({ courses: {} });
    await render();
    setStatus('Cleared all saved courses.');
});

wireExports();
render().then(() => capture(true));
