/** @typedef {import("./types.js").Assignment} Assignment */
/** @typedef {import("./types.js").Group} Group */

/** @type {Assignment[]} */
// Global variable to store fetched data
let currentGrades = []; // 

/** @type {Group[]} */
let currentGroups = [];

document.getElementById('parse-btn').addEventListener('click', async () => {
    const helpElement = document.getElementById('help-text');
    const assignmentNumberElement = document.getElementById('assignment-number');
    const groupNumberElement = document.getElementById('group-number');
    const controlsElement = document.getElementById('download-controls');
    const [tabElement] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (helpElement) {
        if (!tabElement.url.includes("instructure.com") && !tabElement.url.includes("canvas")) {
            helpElement.innerText = "Please go to a Canvas grades page first.";
            helpElement.style = "color: #ff0000;"
            return;
        } else {
            helpElement.innerText = "Click the button to parse grades.";
            helpElement.style = "";
        }
    } else {
        console.log('Could not find help element.');
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
    chrome.tabs.sendMessage(tabElement.id, { action: "getGrades" }, (response) => {
        helpElement.innerText = "Click the button to parse grades.";
        helpElement.style = "";

        if (response && response.data) {
            currentGrades = response.data.grades; // Save data for download
            currentGroups = response.data.groups; // Save data for download
            controlsElement.style.display = 'flex'; // Show download buttons

            if (currentGrades && assignmentNumberElement) {
                assignmentNumberElement.innerText = `${currentGrades.length}`;
            }
            if (currentGroups && groupNumberElement) {
                groupNumberElement.innerText = `${currentGroups.length}`;
            }

        } else {
            helpElement.innerText = "Could not parse grades. Are you on the right page?";
            helpElement.style = "color: #ff0000;"
            groupNumberElement.innerText = "None";
        }
    });
});

// JSON Download Logic
document.getElementById('download-json').addEventListener('click', () => {
    /**
     * @typedef {Group} CurrentGroup
     * @property {number} [score]
     * @property {number} [total]
     * @property {number} [percent]
     */

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

    let currentGrade = 0;

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
            if(!grade?.score || !grade?.total) continue;
            score+=grade.score;
            total+=grade.total;
        }
        currentGrade = score / total;
    }

    const data = {
        "grades": currentGrades,
        "groups": currentGroups,
        "currentGroups": Object.values(groups),
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