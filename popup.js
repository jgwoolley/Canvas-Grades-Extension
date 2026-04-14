/** @typedef {import("./types.js").Assignment} Assignment */
/** @typedef {import("./types.js").Group} Group */
/** @typedef {import("./types.js").CurrentGroup} CurrentGroup */
/** @typedef {import("./types.js").Response} Response */
/** @typedef {import("./types.js").Course} Course */

/** @type {Assignment[]} */
// Global variable to store fetched data
let currentGrades = []; // 

/** @type {Group[]} */
let currentGroups = [];

/** @type {Course[]} */
let currentCourses = [];

/** @type {CurrentGroup[]} */
let parsedGroups = [];

/** @type {number | null} */
let currentGrade = 0;

function calculateGrades() {
    /** @type {Record<string, CurrentGroup>} */
    const groups = {};

    for (const group of currentGroups) {
        /** @type {CurrentGroup} */
        const currentGroup = JSON.parse(JSON.stringify(group));
        currentGroup.score = 0;
        currentGroup.total = 0;
        currentGroup.percent = 0;
        groups[group.group] = currentGroup;
    }

    if (currentGroups.length !== 0) {
        for (const grade of currentGrades) {
            const group = groups[grade?.context];
            if (!group) {
                console.warn({ 'Message': 'Could not find group', group: group, grade: grade, });
                continue;
            }
            if (grade.score == undefined || grade.total == undefined) continue;

            group.score += grade.score;
            group.total += grade.total;
        }

        for (const group of Object.values(groups)) {
            group.percent = group.score / group.total;
            if (group.percent) {
                currentGrade += group.weight * group.percent;
            } else {
                currentGrade += group.weight;
            }
        }
    } else {
        let score = 0;
        let total = 0;
        for (const grade of currentGrades) {
            if (!grade?.score || !grade?.total) continue;
            score += grade.score;
            total += grade.total;
        }
        currentGrade = score / total;
    }

    parsedGroups = Object.values(groups);
}

function getGradesUrlFromTabUrl(tabUrl) {
    try {
        const url = new URL(tabUrl);
        const match = url.pathname.match(/^\/courses\/(\d+)/);
        if (!match) return null;

        return `${url.origin}/courses/${match[1]}/grades`;
    } catch (e) {
        return null;
    }
}

document.getElementById('parse-btn').addEventListener('click', async () => {
    const helpElement = document.getElementById('help-text');
    const gradeLinkContainer = document.getElementById('grade-link-container');
    const gradeLink = document.getElementById('grade-link');
    const assignmentNumberElement = document.getElementById('assignment-number');
    const groupNumberElement = document.getElementById('group-number');
    const currentGradeElement = document.getElementById('current-grade');
    const courseNumberElement = document.getElementById('course-number');
    const controlsElement = document.getElementById('download-controls');
    const [tabElement] = await chrome.tabs.query({ active: true, currentWindow: true });

    gradeLinkContainer.style.display = 'none';
    gradeLink.removeAttribute('href');

    if (!tabElement?.url || (!tabElement.url.includes("instructure.com") && !tabElement.url.includes("canvas"))) {
        helpElement.innerText = "Please go to a Canvas grades page first.";
        helpElement.style = "color: #ff0000;";
        return;
    }

    try {
        // Step 1: Try to see if content.js is already running
        await chrome.tabs.sendMessage(tabElement.id, { action: "ping" });
    } catch (e) {
        // Step 2: If it failed, the script is missing. Inject it now!
        console.log("Injecting script into tab...");
        await chrome.scripting.executeScript({
            target: { tabId: tabElement.id },
            files: ["content.js"]
        });
    }

    // Step 3: Now that we know the script is there, get the data

    chrome.tabs.sendMessage(tabElement.id, { action: "getGrades" }, /**
     * @param {Response | null} response
     */(response) => {
            helpElement.innerText = "Click the button to parse grades.";
            helpElement.style = "";

            if (response && response.data) {
                currentGrades = response.data.grades; // Save data for download
                currentGroups = response.data.groups; // Save data for download
                currentCourses = response.data.courses; // Save data for download
                calculateGrades();
                controlsElement.style.display = 'flex'; // Show download buttons

                if (currentGrades && assignmentNumberElement) {
                    assignmentNumberElement.innerText = `${currentGrades.length}`;
                }
                if (currentGroups && groupNumberElement) {
                    groupNumberElement.innerText = `${currentGroups.length}`;
                }
                if (currentGrade) {
                    currentGradeElement.innerHTML = `${Math.round(currentGrade * 10000) / 100}%`;
                }
                if (currentCourses && courseNumberElement) {
                    courseNumberElement.innerText = `${currentCourses.length}`;
                }

                const gradesUrl = getGradesUrlFromTabUrl(tabElement.url);
                if (gradesUrl && !tabElement.url.includes('/grades')) {
                    helpElement.innerText = "You are not on the Grades page.";
                    const linkText = "Open the correct Grades page";
                    gradeLink.textContent = linkText;
                    gradeLink.href = gradesUrl;
                    gradeLinkContainer.style.display = 'block';
                }

                // Render per-group grade percentages
                const groupGradesList = document.getElementById('group-grades-list');
                const groupGradesItems = document.getElementById('group-grades-items');
                if (groupGradesList && groupGradesItems) {
                    groupGradesItems.innerHTML = '';
                    if (currentGroups && currentGroups.length > 0) {
                        const { groupsMap } = computeGroupGrades(currentGrades, currentGroups);
                        for (const group of Object.values(groupsMap)) {
                            const li = document.createElement('li');
                            const pct = isFinite(group.percent) && group.percent > 0
                                ? `${(group.percent * 100).toFixed(1)}%`
                                : 'N/A';
                            li.textContent = `${group.group}: ${pct}`;
                            groupGradesItems.appendChild(li);
                        }
                        groupGradesList.style.display = '';
                    } else {
                        groupGradesList.style.display = 'none';
                    }
                }

            } else {
                helpElement.innerText = "Could not parse grades. Are you on the right page?";
                helpElement.style = "color: #ff0000;";
                groupNumberElement.innerText = "None";

                const gradesUrl = getGradesUrlFromTabUrl(tabElement.url);
                if (gradesUrl) {
                    gradeLink.textContent = "Open the correct Grades page";
                    gradeLink.href = gradesUrl;
                    gradeLinkContainer.style.display = 'block';
                }
            }
        });
});

/**
 * @typedef {Group} CurrentGroup
 * @property {number} [score]
 * @property {number} [total]
 * @property {number} [percent]
 */

/**
 * Computes per-group scores/percentages and overall grade from raw grades and groups.
 *
 * @param {Assignment[]} grades
 * @param {Group[]} groups
 * @returns {{ groupsMap: Record<string, CurrentGroup>, currentGrade: number }}
 */
function computeGroupGrades(grades, groups) {
    /** @type {Record<string, CurrentGroup>} */
    const groupsMap = {};

    for (const group of groups) {
        /** @type {CurrentGroup} */
        const currentGroup = JSON.parse(JSON.stringify(group));
        currentGroup.score = 0;
        currentGroup.total = 0;
        currentGroup.percent = 0;
        groupsMap[group.group] = currentGroup;
    }

    let currentGrade = 0;

    if (groups.length !== 0) {
        for (const grade of grades) {
            const group = groupsMap[grade?.context];
            if (!group) {
                console.warn({ 'Message': 'Could not find group', group: group, grade: grade, });
                continue;
            }
            if (grade.score == undefined || grade.total == undefined) continue;

            group.score += grade.score;
            group.total += grade.total;
        }

        for (const group of Object.values(groupsMap)) {
            group.percent = group.score / group.total;
            if (group.percent) {
                currentGrade += group.weight * group.percent;
            } else {
                currentGrade += group.weight;
            }
        }
    } else {
        let score = 0;
        let total = 0;
        for (const grade of grades) {
            if (!grade?.score || !grade?.total) continue;
            score += grade.score;
            total += grade.total;
        }
        currentGrade = score / total;
    }

    return { groupsMap, currentGrade };
}

// JSON Download Logic
document.getElementById('download-json').addEventListener('click', () => {
    const { groupsMap, currentGrade } = computeGroupGrades(currentGrades, currentGroups);

    const data = {
        "grades": currentGrades,
        "groups": currentGroups,
        "currentGroups": Object.values(groupsMap),
        "currentGrade": currentGrade,
    };

    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    downloadBlob(blob, "canvas_grades.json");
});

// CSV Download Logic
document.getElementById('download-csv').addEventListener('click', () => {
    const headers = ["name", "score", "total", "dueDate", "submittedDate", "href"];
    const csvContent = [
        headers.join(","), // Header row
        ...currentGrades.map(item => headers.map(fieldName => {
            // Escape quotes and wrap in quotes to handle commas in names
            const value = (item[fieldName] || "").toString().replace(/"/g, '""');
            return `"${value}"`;
        }).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "canvas_grades.csv");
});

// Helper function to trigger download
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}