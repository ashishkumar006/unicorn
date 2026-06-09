const express = require('express');
const path = require('path');
const fs = require('fs');
const { runAutonomousBrowserTask } = require('./agent');

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const taskStore = new Map();

function createTaskId() {
  return Date.now().toString();
}

function updateTask(taskId, patch) {
  const currentTask = taskStore.get(taskId) || { taskId };
  taskStore.set(taskId, {
    ...currentTask,
    ...patch,
    taskId,
    updatedAt: new Date().toISOString()
  });
}

function launchTask(taskId, goal, url, resume = false) {
  updateTask(taskId, {
    goal,
    url,
    resume,
    status: 'running',
    statusText: resume ? 'Resuming after CAPTCHA' : 'Starting browser task'
  });

  runAutonomousBrowserTask(goal, url, resume, {
    onStatus: (statusText) => {
      updateTask(taskId, {
        status: 'running',
        statusText
      });
    }
  })
    .then((result) => {
      if (result.needsHuman) {
        updateTask(taskId, {
          status: 'needsHuman',
          statusText: result.message || 'CAPTCHA detected. Please solve it in the browser window.',
          captchaScreenshot: result.captchaScreenshot,
          result
        });
        return;
      }

      updateTask(taskId, {
        status: 'done',
        statusText: 'Task complete',
        result
      });
    })
    .catch((error) => {
      updateTask(taskId, {
        status: 'error',
        statusText: error.message,
        error: error.message
      });
    });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/task', async (req, res) => {
  const { goal, url, resume, stream } = req.body;
  
  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }
  
  const startUrl = url && url.trim() ? url : 'https://duckduckgo.com';

  if (stream) {
    const taskId = createTaskId();
    updateTask(taskId, {
      goal,
      url: startUrl,
      resume: Boolean(resume),
      status: 'queued',
      statusText: 'Starting browser task'
    });

    launchTask(taskId, goal, startUrl, Boolean(resume));
    return res.json({
      taskId,
      status: 'queued',
      statusText: 'Starting browser task'
    });
  }
  
  try {
    const result = await runAutonomousBrowserTask(goal, startUrl, resume);
    
    if (result.needsHuman) {
      const taskId = createTaskId();
      updateTask(taskId, {
        goal,
        url: startUrl,
        status: 'needsHuman',
        statusText: result.message || 'CAPTCHA detected. Please solve it in the browser window.',
        captchaScreenshot: result.captchaScreenshot,
        result
      });
      result.taskId = taskId;
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/task/:taskId', (req, res) => {
  const task = taskStore.get(req.params.taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found or expired' });
  }

  res.json(task);
});

app.post('/api/resume/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { stream } = req.body;
  const taskInfo = taskStore.get(taskId);
  
  if (!taskInfo) {
    return res.status(404).json({ error: 'Task not found or expired' });
  }

  if (stream) {
    launchTask(taskId, taskInfo.goal, taskInfo.url, true);
    return res.json({
      taskId,
      status: 'queued',
      statusText: 'Resuming task after CAPTCHA'
    });
  }
  
  try {
    const result = await runAutonomousBrowserTask(taskInfo.goal, taskInfo.url, true);
    updateTask(taskId, {
      ...taskInfo,
      status: result.needsHuman ? 'needsHuman' : 'done',
      statusText: result.needsHuman
        ? result.message || 'CAPTCHA detected. Please solve it in the browser window.'
        : 'Task complete',
      captchaScreenshot: result.captchaScreenshot,
      result
    });
    res.json(result);
  } catch (error) {
    updateTask(taskId, {
      ...taskInfo,
      status: 'error',
      statusText: error.message,
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Browser Agent Test running at http://localhost:${PORT}`);
});

// Serve artifacts
app.get('/api/artifacts/:artifactId', (req, res) => {
  const { artifactId } = req.params;
  const artifactPath = path.join(__dirname, 'artifacts', artifactId);
  
  try {
    const content = fs.readFileSync(artifactPath, 'utf8');
    res.json(JSON.parse(content));
  } catch (e) {
    res.status(404).json({ error: 'Artifact not found' });
  }
});