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

            if (earnedScore !== "") {
                earnedScore = parseFloat(earnedScore);
            } else {
                earnedScore = null;
            }

            let originalScoreRaw = null;
            let originalScore = null;
            if (originalScoreElement) {
                originalScoreRaw = originalScoreElement.innerText.trim();
                originalScore = parseFloat(originalScoreRaw);
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

            const parsedHref = parseHref(titleElement.href);

            assignments.push({
                course_id: parsedHref?.courses ?? pageParsedHref?.courses,
                assignment_id: parsedHref?.assignments ?? pageParsedHref?.assignments,
                submission_id: parsedHref?.submissions ?? pageParsedHref?.submissions,
                href: titleElement.href,
                name: titleElement.innerText.trim(),
                score: earnedScore ?? originalScore,
                total: totalPoints,
                context: contextElement.innerText.trim(),
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
 *
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
 * 
 * @returns {AssignmentResponse}
 */
function getResponseFromDOM() {
    const grades = getGradesFromDOM();
    const groups = getGroupsFromDOM();
    const courses = getCoursesFromDOM();
    
    return { data: { grades, groups, courses } };
}

// HARDENED LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        sendResponse({ status: "alive" });
    } else if (request.action === "getGrades") {
        const response = getResponseFromDOM();
        console.log(response);
        sendResponse(response);
    }
    return true; // CRITICAL: This keeps the message channel open for the response
});