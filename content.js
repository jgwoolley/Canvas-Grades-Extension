// Function to handle the date logic
function parseCanvasDate(dateStr) {
    if (!dateStr) return "N/A";

    // 1. Clean whitespace and remove the 'by'/'at' words
    let clean = dateStr.replace(/\bby\b/i, '').replace(/\bat\b/i, '').replace(/\s+/g, ' ').trim();

    if (clean.toLowerCase().includes("no due date") || clean === "") {
        return "No Date";
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

// Main parsing logic
function getGradesFromDOM() {
    const assignments = [];
    const rows = document.querySelectorAll('tr.student_assignment:not(.group_total)');

    rows.forEach(row => {
        const titleElement = row.querySelector('th.title a');
        const scoreElement = row.querySelector('span.original_score');
        const scoreCell = row.querySelector('td.assignment_score');
        const contextElement = row.querySelector('div.context');

        const dueElement = row.querySelector('td.due');
        const submittedElement = row.querySelector('td.submitted');

        if (titleElement && scoreCell) {
            const earnedSpan = scoreCell.querySelector('.original_points');
            let earnedScore = earnedSpan ? earnedSpan.innerText.trim() : "";
            
            if (earnedScore !== "") {
                earnedScore = parseFloat(earnedScore).toString();
            } else {
                earnedScore = "Pending";
            }

            let totalPoints = "0";
            const spans = scoreCell.querySelectorAll('span');
            const totalSpan = Array.from(spans).find(s => s.textContent.includes('/'));
            
            if (totalSpan) {
                const text = totalSpan.textContent; // e.g., "94 / 100"
                const match = text.match(/\/\s*([\d.]+)/);
                if (match && match[1]) {
                    totalPoints = match[1];
                }
            }

            assignments.push({
                href: titleElement.href,
                name: titleElement.innerText.trim(),
                score: earnedScore,
                total: totalPoints,
                context: contextElement.innerText.trim(),
                dueDate: parseCanvasDate(dueElement ? dueElement.innerText.trim() : ""),
                submittedDate: parseCanvasDate(submittedElement ? submittedElement.innerText.trim() : ""),
            });
        }
    });
    return assignments;
}

function getWeightsFromDOM() {
    const weights = [];
    // Target the table inside the specific weighted assignments div
    const weightTable = document.querySelector('#assignments-not-weighted table.summary tbody');
    
    if (weightTable) {
        const rows = weightTable.querySelectorAll('tr');
        rows.forEach(row => {
            const groupNameElement = row.querySelector('th');
            const weightValueElement = row.querySelector('td');
            
            if (groupNameElement && weightValueElement) {
                const name = groupNameElement.innerText.trim();
                const weight = weightValueElement.innerText.trim();
                
                // Don't include the "Total" row in our data array
                if (name.toLowerCase() !== 'total') {
                    weights.push({ group: name, weight: weight });
                }
            }
        });
    }
    return weights;
}

// HARDENED LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        sendResponse({ status: "alive" });
    } else if (request.action === "getGrades") {
        const grades = getGradesFromDOM();
        const weights = getWeightsFromDOM();
        const response = { data: { grades, weights } };
        console.log(response);
        sendResponse(response);
    }
    return true; // CRITICAL: This keeps the message channel open for the response
});