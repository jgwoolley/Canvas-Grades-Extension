// Function to handle the date logic

/** @typedef {import("./types.js").Assignment} Assignment */
/** @typedef {import("./types.js").Group} Group */
/** @typedef {import("./types.js").CurrentGroup} CurrentGroup */
/** @typedef {import("./types.js").Course} Course */
/** @typedef {import("./types.js").AssignmentResponse} AssignmentResponse */

/**
 * Function to handle the date logic
 * 
 * @param {string | null} dateStr - Canvas date string to parse.
 * @returns {Date | null} Parsed Date object, or null if `dateStr` is falsy or invalid.
 */
function parseCanvasDate(dateStr) {
    if (!dateStr) return null;

    // 1. Clean whitespace and remove the 'by'/'at' words
    let clean = dateStr.replace(/\bby\b/i, '').replace(/\bat\b/i, '').replace(/\s+/g, ' ').trim();

    if (clean.toLowerCase().includes("no due date") || clean === "") {
        return null;
    }

    // 2. Use Regex to pull out the components: (Month) (Day) (Time)
    // Example: "Feb 12 5:15pm" -> ["Feb", "12", "5:15pm"]
    const parts = clean.match(/([A-Za-z]+)\s+(\d+)\s+(.+)/);

    if (parts) {
        const month = parts[1];
        const day = parts[2];
        let time = parts[3].toLowerCase();
        const year = new Date().getFullYear();

        // 3. Reformat time: "5:15pm" -> "5:15 PM" (JS prefers the space)
        time = time.replace(/am/, ' AM').replace(/pm/, ' PM');

        // 4. Construct a standard format: "Feb 12, 2026 5:15 PM"
        const standardizedStr = `${month} ${day}, ${year} ${time}`;
        const dateAttempt = new Date(standardizedStr);

        if (!isNaN(dateAttempt.getTime())) {
            return dateAttempt.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        }
    }

    // If all else fails, return the original string cleaned up
    return clean;
}

/**
 * 
 * @param {string | null} weightRaw 
 * @returns {float | null}
 */
function parsePercentage(weightRaw) {
    const value = Number.parseFloat(weightRaw);
    return Number.isFinite(value) ? value / 100 : null;
}

/**
 * Parses a Canvas URL and extracts numeric IDs from known path segments.
 *
 * Expected paths look like:
 * - /courses/#/assignments/#
 * - /courses/#/assignments/#/submissions/#
 *
 * @param {string} href - A full Canvas URL.
 * @returns {CanvasHrefParts} An object containing extracted IDs keyed by path segment name.
 * @throws {TypeError} If `href` is not a valid URL.
 */
function parseHref(href) {
    /** @type {CanvasHrefParts} */
    const result = { "courses": null, "assignments": null, "submissions": null, };
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);

    for (let index = 1; index < parts.length; index++) {
        const key = parts[index - 1];
        const value = parts[index];

        if (key === "courses" || key === "assignments" || key === "submissions") {
            result[key] = Number.parseInt(value, 10);
        }
    }

    return result;
}

/**
 * Parses grades from page
 *
 * @returns {Assignment[]}
 */
function getGradesFromDOM() {
    /** @type {CanvasHrefParts[]} */
    const assignments = [];
    const rows = document.querySelectorAll('tr.student_assignment:not(.group_total)');

    const pageParsedHref = parseHref(window.location.href);

    rows.forEach(row => {
        const titleElement = row.querySelector('th.title a');
        const originalScoreElement = row.querySelector('span.original_score');
        const scoreCell = row.querySelector('td.assignment_score');
        const contextElement = row.querySelector('div.context');

        const dueElement = row.querySelector('td.due');
        const submittedElement = row.querySelector('td.submitted');

        if (titleElement && scoreCell) {
            const earnedSpan = scoreCell.querySelector('.original_points');
            let earnedScore = earnedSpan ? earnedSpan.innerText.trim() : "";
            earnedScore = earnedScore !== "" ? parseFloat(earnedScore) : null;
            if (Number.isNaN(earnedScore)) earnedScore = null;

            let originalScoreRaw = null;
            let originalScore = null;
            if (originalScoreElement) {
                originalScoreRaw = originalScoreElement.innerText.trim();
                originalScore = parseFloat(originalScoreRaw);
                if (Number.isNaN(originalScore)) originalScore = null;
            }

            let totalPoints = null;
            const spans = scoreCell.querySelectorAll('span');
            const totalSpan = Array.from(spans).find(s => s.textContent.includes('/'));

            if (totalSpan) {
                const text = totalSpan.textContent; // e.g., "94 / 100"
                const match = text.match(/\/\s*([\d.]+)/);
                if (match && match[1]) {
                    totalPoints = parseFloat(match[1]);
                }
            }

            // Partially graded quizzes (auto-graded part only) and unposted grades are not final.
            const submissionStatus = (row.querySelector('.submission_status')?.textContent || '').trim();
            const notPosted = /has not posted/i.test(scoreCell.innerText);
            const incomplete = submissionStatus === 'pending_review' || row.dataset.pending_quiz === 'true' || notPosted;

            const parsedHref = parseHref(titleElement.href);

            assignments.push({
                course_id: parsedHref?.courses ?? pageParsedHref?.courses,
                assignment_id: parsedHref?.assignments ?? pageParsedHref?.assignments,
                submission_id: parsedHref?.submissions ?? pageParsedHref?.submissions,
                href: titleElement.href,
                name: titleElement.innerText.trim(),
                score: earnedScore ?? originalScore,
                incomplete,
                submissionStatus,
                scoreRaw: scoreCell.innerText.replace(/\s+/g, ' ').trim(),
                total: totalPoints,
                context: contextElement ? contextElement.innerText.trim() : "",
                dueDate: parseCanvasDate(dueElement ? dueElement.innerText.trim() : ""),
                submittedDate: parseCanvasDate(submittedElement ? submittedElement.innerText.trim() : ""),
            });
        }
    });
    return assignments;
}

/**
 * Parses group from page
 *
 * @returns {Group[]}
 */
function getGroupsFromDOM() {
    /** @type {Group[]} */
    const groups = [];
    // Target the table inside the specific weighted assignments div
    const groupTable = document.querySelector('#assignments-not-weighted table.summary tbody');

    const pageParsedHref = parseHref(window.location.href);

    if (groupTable) {
        const rows = groupTable.querySelectorAll('tr');
        rows.forEach(row => {
            const groupNameElement = row.querySelector('th');
            const weightValueElement = row.querySelector('td');

            if (groupNameElement && weightValueElement) {
                const name = groupNameElement.innerText.trim();
                const weightRaw = weightValueElement.innerText.trim();
                const weight = parsePercentage(weightRaw);

                // Don't include the "Total" row in our data array
                if (name.toLowerCase() !== 'total') {
                    groups.push({
                        group: name,
                        weightRaw: weightRaw,
                        weight: weight,
                        course_id: pageParsedHref?.courses,
                    });
                }
            }
        });
    }
    return groups;
}

/**
 * Parses group from page. Only works when it is open though... Should use 
 * 
 * /api/v1/users/self/favorites/courses?include[]=term&include[]=sections&sort=nickname
 * /api/v1/courses/166241/users/self?include[]=enrollments
 * @returns {Course[]}
 */
function getCoursesFromDOM() {
    const coursesSection = [...document.querySelectorAll('h2')]
        .find(h2 => h2.textContent.trim() === 'Courses')
        ?.closest('div');

    return coursesSection
        ? [...coursesSection.querySelectorAll('a[href^="/courses/"]')]
            .map(a => {
                const href = a.getAttribute('href');
                const match = href && href.match(/^\/courses\/(\d+)\/?$/);
                if (!match) return null;

                const courseName = a.textContent.trim().split('\n')[0].trim();

                return {
                    courseId: parseInt(match[1]),
                    courseName,
                    href,
                };
            })
            .filter(Boolean)
        : [];
}

/**
 * Course id / name / Canvas-reported grade for the current page.
 */
function getCourseInfoFromDOM() {
    const courseId = parseHref(window.location.href)?.courses ?? null;
    // Title is "Grades for <student>: <course>"; course names may contain colons, so split on the first.
    const m = document.title.match(/^Grades(?: for [^:]*)?:\s*(.+)$/);
    let name = m ? m[1].trim() : null;
    if (!name) {
        const crumb = [...document.querySelectorAll('#breadcrumbs a')]
            .find(a => new RegExp(`/courses/${courseId}/?$`).test(a.getAttribute('href') || ''));
        name = crumb ? crumb.innerText.trim() : null;
    }
    if (!name || /^(grades?|home|dashboard)$/i.test(name)) name = courseId ? `Course ${courseId}` : null;

    const gradeEl = document.querySelector('.final_grade .grade, #student-grades-final, .student_assignment.final_grade .grade');
    const canvasReportedGrade = gradeEl ? gradeEl.innerText.replace(/\s+/g, ' ').trim() : null;
    return { courseId, name, canvasReportedGrade };
}

/**
 * Raw snapshot of the page pieces the parser reads, so the parse can be audited later.
 * `rows` pairs every table row (including group totals, which are not parsed) with its text.
 */
function getRawFromDOM() {
    const squash = str => str.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
    const grab = sel => {
        const el = document.querySelector(sel);
        return el ? squash(el.outerHTML) : null;
    };
    const rows = [...document.querySelectorAll('#grades_summary tbody tr')].map(tr => ({
        parsedAsAssignment: tr.matches('tr.student_assignment:not(.group_total)'),
        id: tr.id || null,
        text: tr.innerText.replace(/\s+/g, ' ').trim(),
        html: squash(tr.outerHTML),
    }));
    const content = document.querySelector('#content');
    return {
        url: window.location.href,
        title: document.title,
        capturedAt: new Date().toISOString(),
        pageText: content ? content.innerText.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 30000) : null,
        groupsHtml: grab('#assignments-not-weighted'),
        finalGradeHtml: grab('.student_assignment.final_grade'),
        rows,
    };
}

/**
 * @returns {AssignmentResponse}
 */
function getResponseFromDOM() {
    const grades = getGradesFromDOM();
    const groups = getGroupsFromDOM();
    const courses = getCoursesFromDOM();
    const course = getCourseInfoFromDOM();
    const raw = getRawFromDOM();

    return { data: { grades, groups, courses, course, raw } };
}

if (!window.__canvasGradeParserLoaded) {
    window.__canvasGradeParserLoaded = true;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "ping") {
            sendResponse({ status: "alive" });
        } else if (request.action === "getGrades") {
            sendResponse(getResponseFromDOM());
        }
        return true; // keep the message channel open for the response
    });
}
