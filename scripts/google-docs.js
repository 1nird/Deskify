import fs from 'fs';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file'
];

const CREDENTIALS_PATH = path.join(process.cwd(), 'scripts', 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'scripts', 'token.json');

/**
 * Reads previously authorized credentials from the save file.
 */
async function loadSavedCredentialsIfExist() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    console.error('Error loading saved credentials:', err);
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 */
async function saveCredentials(client) {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  fs.writeFileSync(TOKEN_PATH, payload);
}

/**
 * Load or request authorization to call APIs.
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json not found at ${CREDENTIALS_PATH}.\n` +
      `Please follow the instructions to download OAuth 2.0 Desktop credentials from Google Cloud Console.`
    );
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Converts a Google Doc body to clean Markdown.
 */
function docToMarkdown(document) {
  let markdown = '';
  const body = document.body;
  if (!body || !body.content) return '';

  for (const element of body.content) {
    if (element.paragraph) {
      const paragraph = element.paragraph;
      let text = '';
      if (paragraph.elements) {
        for (const el of paragraph.elements) {
          if (el.textRun && el.textRun.content) {
            let runText = el.textRun.content;
            const style = el.textRun.textStyle || {};
            // Basic formatting
            if (style.bold && runText.trim()) runText = `**${runText}**`;
            if (style.italic && runText.trim()) runText = `*${runText}*`;
            text += runText;
          }
        }
      }

      // Handle structural styles based on paragraph namedStyleType
      const styleType = paragraph.paragraphStyle?.namedStyleType;
      if (styleType === 'TITLE') {
        markdown += `# ${text.trim()}\n\n`;
      } else if (styleType === 'SUBTITLE') {
        markdown += `## ${text.trim()}\n\n`;
      } else if (styleType?.startsWith('HEADING_')) {
        const level = styleType.split('_')[1];
        markdown += `${'#'.repeat(parseInt(level))} ${text.trim()}\n\n`;
      } else if (paragraph.bullet) {
        // Bullet list
        markdown += `- ${text}`;
      } else {
        markdown += text;
      }
    } else if (element.table) {
      // Basic table support
      markdown += '\n[Table content omitted for simplicity]\n\n';
    } else if (element.sectionBreak) {
      // Ignore section breaks
    }
  }
  return markdown;
}

/**
 * Get Google Doc content.
 */
async function readDoc(documentId) {
  const auth = await authorize();
  const docs = google.docs({ version: 'v1', auth });
  const res = await docs.documents.get({ documentId });
  const title = res.data.title;
  const markdown = docToMarkdown(res.data);
  
  const outputDir = path.join(process.cwd(), 'google-docs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filePath = path.join(outputDir, `${safeTitle}_${documentId}.md`);
  fs.writeFileSync(filePath, markdown, 'utf8');
  
  console.log(`Successfully downloaded "${title}"`);
  console.log(`Saved locally to: ${filePath}`);
}

/**
 * Creates updates to clear doc and insert fresh Markdown content.
 */
async function writeDoc(documentId, localFilePath) {
  const auth = await authorize();
  const docs = google.docs({ version: 'v1', auth });
  
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Local file not found at ${localFilePath}`);
  }
  
  const newContent = fs.readFileSync(localFilePath, 'utf8');
  
  // 1. Get current length to delete existing text
  const doc = await docs.documents.get({ documentId });
  const bodyContent = doc.data.body.content;
  const endOfDoc = bodyContent[bodyContent.length - 1].endIndex;
  
  const requests = [];
  
  // Delete existing content (excluding the final newline range which cannot be deleted)
  if (endOfDoc > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endOfDoc - 1,
        },
      },
    });
  }
  
  // Insert new content
  requests.push({
    insertText: {
      location: {
        index: 1,
      },
      text: newContent,
    },
  });
  
  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
  
  console.log(`Successfully updated Google Doc (${documentId}) with contents of ${localFilePath}`);
}

/**
 * Creates a brand new Google Doc.
 */
async function createDoc(title) {
  const auth = await authorize();
  const docs = google.docs({ version: 'v1', auth });
  const res = await docs.documents.create({
    requestBody: { title }
  });
  console.log(`Successfully created Google Doc: "${res.data.title}"`);
  console.log(`Document ID: ${res.data.documentId}`);
  console.log(`Link: https://docs.google.com/document/d/${res.data.documentId}/edit`);
}

// CLI entrypoint
const [,, command, arg1, arg2] = process.argv;

if (!command) {
  console.log(`
Usage:
  node scripts/google-docs.js read <documentId>
  node scripts/google-docs.js write <documentId> <localFilePath>
  node scripts/google-docs.js create <title>
  `);
  process.exit(0);
}

try {
  if (command === 'read') {
    if (!arg1) throw new Error('Please specify a Document ID.');
    await readDoc(arg1);
  } else if (command === 'write') {
    if (!arg1 || !arg2) throw new Error('Please specify both a Document ID and a local file path.');
    await writeDoc(arg1, arg2);
  } else if (command === 'create') {
    if (!arg1) throw new Error('Please specify a title for the document.');
    await createDoc(arg1);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (err) {
  console.error('Error executing command:', err.message);
  process.exit(1);
}
