const fs = require('fs');
const path = 'src/components/AIAssistantPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldStr = `        const validated = intent === "session"
          ? (raw as DraftStudySession)
          : (raw as DraftEvent)

        setMessages((prev) =>`; 

const newStr = `        const validated = intent === "session"
          ? (raw as DraftStudySession)
          : (raw as DraftEvent)

        // ponytail: guard against models that omit required fields despite strict schema
        if (
          !validated ||
          typeof validated.title !== "string" ||
          typeof validated.startTime !== "string"
        ) {
          throw new Error(
            "The AI returned an incomplete draft. Try again with a clearer prompt.",
          )
        }

        setMessages((prev) =>`;

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(path, content);
  console.log('SUCCESS: Validation guard added');
} else {
  console.log('ERROR: Pattern not found');
  const idx = content.indexOf('const validated = intent');
  if (idx !== -1) {
    console.log('Found at index:', idx);
    console.log(JSON.stringify(content.substring(idx, idx + 200)));
  } else {
    console.log('Could not find validation area at all');
  }
}
