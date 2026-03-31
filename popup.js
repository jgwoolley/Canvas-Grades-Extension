let currentGrades = []; // Global variable to store fetched data
let currentWeights = []

document.getElementById('parse-btn').addEventListener('click', async () => {
    const helpElement = document.getElementById('help-text');
    const assignmentNumberElement = document.getElementById('assignment-number');
    const groupNumberElement = document.getElementById('group-number');
    const controlsElement = document.getElementById('download-controls');
    const [tabElement] = await chrome.tabs.query({ active: true, currentWindow: true });

    if(helpElement) {
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
            currentWeights = response.data.weights; // Save data for download
            controlsElement.style.display = 'flex'; // Show download buttons

            if(currentGrades && assignmentNumberElement) {
                assignmentNumberElement.innerText = `${currentGrades.length}`;
            }
            if(currentWeights && groupNumberElement) {
                groupNumberElement.innerText = `${currentWeights.length}`;
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
    const dataStr = JSON.stringify({"grades": currentGrades, "weights": currentWeights}, null, 2);
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