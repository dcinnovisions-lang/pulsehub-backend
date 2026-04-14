const { Task, Project, Status, User, Workspace } = require('../models');
const logger = require('../utils/logger');

/**
 * @desc    Export tasks to CSV
 * @route   GET /api/v1/tasks/export
 * @access  Private
 */
const exportTasksToCSV = async (req, res, next) => {
  try {
    const { projectId, workspaceId } = req.query;

    const whereClause = {};
    if (projectId) {
      whereClause.projectId = projectId;
    }

    const tasks = await Task.findAll({
      where: whereClause,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name'],
          include: [
            {
              model: Workspace,
              as: 'workspace',
              attributes: ['id', 'name'],
              where: workspaceId ? { id: workspaceId } : undefined
            }
          ]
        },
        {
          model: Status,
          as: 'status',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          through: { attributes: [] }
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Convert to CSV
    const headers = ['Title', 'Description', 'Project', 'Workspace', 'Status', 'Priority', 'Due Date', 'Created By', 'Assignees', 'Progress', 'Created At'];
    const rows = tasks.map(task => [
      task.title || '',
      task.description || '',
      task.project?.name || '',
      task.project?.workspace?.name || '',
      task.status?.name || '',
      task.priority || '',
      task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '',
      task.creator ? `${task.creator.firstName} ${task.creator.lastName}` : '',
      task.assignees?.map(a => `${a.firstName} ${a.lastName}`).join('; ') || '',
      `${task.progress || 0}%`,
      task.createdAt ? new Date(task.createdAt).toLocaleDateString() : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=tasks-${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    logger.error('Export tasks to CSV error:', error);
    next(error);
  }
};

/**
 * @desc    Import tasks from CSV
 * @route   POST /api/v1/tasks/import
 * @access  Private
 */
const importTasksFromCSV = async (req, res, next) => {
  try {
    const { csvData, projectId } = req.body;

    if (!csvData || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'CSV data and projectId are required'
      });
    }

    // Verify project exists
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Parse CSV
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'CSV must have at least a header row and one data row'
      });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const tasks = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

      if (values.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch`);
        continue;
      }

      const taskData = {};
      headers.forEach((header, index) => {
        const value = values[index];
        const lowerHeader = header.toLowerCase();

        if (lowerHeader.includes('title')) {
          taskData.title = value;
        } else if (lowerHeader.includes('description')) {
          taskData.description = value;
        } else if (lowerHeader.includes('priority')) {
          taskData.priority = ['urgent', 'high', 'medium', 'low'].includes(value.toLowerCase())
            ? value.toLowerCase()
            : 'medium';
        } else if (lowerHeader.includes('due date') || lowerHeader.includes('duedate')) {
          if (value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              taskData.dueDate = date;
            }
          }
        } else if (lowerHeader.includes('progress')) {
          const progress = parseInt(value.replace('%', ''));
          if (!isNaN(progress)) {
            taskData.progress = Math.min(100, Math.max(0, progress));
          }
        }
      });

      if (!taskData.title) {
        errors.push(`Row ${i + 1}: Title is required`);
        continue;
      }

      taskData.projectId = projectId;
      taskData.createdBy = req.user.id;
      tasks.push(taskData);
    }

    if (errors.length > 0 && tasks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Import failed',
        details: errors
      });
    }

    // Create tasks
    const createdTasks = await Task.bulkCreate(tasks);

    res.status(201).json({
      success: true,
      count: createdTasks.length,
      data: createdTasks,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('Import tasks from CSV error:', error);
    next(error);
  }
};

module.exports = {
  exportTasksToCSV,
  importTasksFromCSV
};
