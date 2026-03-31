let currentGrades = []; // Global variable to store fetched data

document.getElementById('parse-btn').addEventListener('click', async () => {
    const listDiv = document.getElementById('grade-list');
    const controls = document.getElementById('download-controls');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes("instructure.com") && !tab.url.includes("canvas")) {
        listDiv.innerText = "Please go to a Canvas grades page first.";
        return;
    }

    try {
        // Step 1: Try to see if content.js is already running
        await chrome.tabs.sendMessage(tab.id, { action: "ping" });
    } catch (e) {
        // Step 2: If it failed, the script is missing. Inject it now!
        console.log("Injecting script into tab...");
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        });
    }

    // Step 3: Now that we know the script is there, get the data
    chrome.tabs.sendMessage(tab.id, { action: "getGrades" }, (response) => {
        listDiv.innerHTML = '';

        if (response && response.data) {
            currentGrades = response.data; // Save data for download
            controls.style.display = 'flex'; // Show download buttons

            response.data.forEach(item => {
                const div = document.createElement('div');
                div.style.borderBottom = "1px solid #eee";
                div.style.padding = "5px 0";
                div.innerHTML = `
                    <strong>${item.name}</strong><br>
                    <span style="color:#2c3e50">Score: ${item.score} / ${item.total}</span><br>
                    <small style="color:#666">Due: ${item.dueDate}</small>
                `;
                listDiv.appendChild(div);
            });
        } else {
            listDiv.innerText = "Could not parse grades. Are you on the right page?";
        }
    });
});

// JSON Download Logic
document.getElementById('download-json').addEventListener('click', () => {
    const dataStr = JSON.stringify(currentGrades, null, 2);
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