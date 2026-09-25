const { Task, Project, TaskDependency, Status, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Calculate task timeline based on dependencies and dates
 */
const calculateTaskTimeline = (task, allTasks, dependencies) => {
  let startDate = task.startDate ? new Date(task.startDate) : new Date();
  let endDate = task.dueDate ? new Date(task.dueDate) : null;

  // If no due date, estimate based on estimated hours (8 hours per day)
  if (!endDate && task.estimatedHours) {
    const days = Math.ceil(task.estimatedHours / 8);
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);
  }

  // If still no end date, default to 1 day
  if (!endDate) {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
  }

  // Adjust start date based on dependencies
  const taskDependencies = dependencies.filter(dep => dep.taskId === task.id);
  if (taskDependencies.length > 0) {
    let maxDependencyEnd = startDate;
    
    for (const dep of taskDependencies) {
      const depTask = allTasks.find(t => t.id === dep.dependsOnTaskId);
      if (depTask) {
        const depEndDate = depTask.dueDate 
          ? new Date(depTask.dueDate)
          : depTask.startDate
          ? new Date(depTask.startDate)
          : null;
        
        if (depEndDate && depEndDate > maxDependencyEnd) {
          maxDependencyEnd = new Date(depEndDate);
          // Add 1 day buffer between tasks
          maxDependencyEnd.setDate(maxDependencyEnd.getDate() + 1);
        }
      }
    }

    if (maxDependencyEnd > startDate) {
      startDate = maxDependencyEnd;
      // Recalculate end date if start date changed
      if (task.estimatedHours) {
        const days = Math.ceil(task.estimatedHours / 8);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + days);
      } else {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }
    }
  }

  return {
    start: startDate,
    end: endDate,
    duration: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) // days
  };
};

/**
 * @desc    Get Gantt view data for a project
 * @route   GET /api/v1/gantt/:projectId
 * @access  Private
 */
const getGanttData = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify project exists and user has access
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get all tasks for the project
    let tasks = await Task.findAll({
      where: {
        projectId,
        isArchived: false
      },
      include: [
        {
          model: Status,
          as: 'status',
          attributes: ['id', 'name', 'color']
        },
        {
          model: User,
          as: 'assignees',
          attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'],
          through: { attributes: [] }
        }
      ],
      order: [['position', 'ASC']]
    });

    // Get all dependencies for these tasks
    const taskIds = tasks.map(t => t.id);
    const dependencies = await TaskDependency.findAll({
      where: {
        [Op.or]: [
          { taskId: { [Op.in]: taskIds } },
          { dependsOnTaskId: { [Op.in]: taskIds } }
        ]
      }
    });

    // Calculate timeline for each task
    const ganttTasks = tasks.map(task => {
      const timeline = calculateTaskTimeline(task, tasks, dependencies);
      
      // Get dependencies for this task
      const taskDeps = dependencies
        .filter(dep => dep.taskId === task.id)
        .map(dep => ({
          id: dep.id,
          dependsOnTaskId: dep.dependsOnTaskId,
          type: dep.type
        }));

      return {
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        statusId: task.statusId,
        status: task.status,
        priority: task.priority,
        assignees: task.assignees,
        startDate: timeline.start.toISOString(),
        endDate: timeline.end.toISOString(),
        dueDate: task.dueDate,
        estimatedHours: task.estimatedHours,
        progress: task.progress,
        dependencies: taskDeps,
        duration: timeline.duration
      };
    });

    // Calculate milestones (tasks with no dependencies and no dependents)
    const milestoneTaskIds = new Set();
    tasks.forEach(task => {
      const hasDependencies = dependencies.some(dep => dep.taskId === task.id);
      const hasDependents = dependencies.some(dep => dep.dependsOnTaskId === task.id);
      if (!hasDependencies && !hasDependents) {
        milestoneTaskIds.add(task.id);
      }
    });

    // Calculate critical path (longest path through dependencies)
    const calculateCriticalPath = (taskId, visited = new Set(), path = []) => {
      if (visited.has(taskId)) return path;
      visited.add(taskId);

      const task = tasks.find(t => t.id === taskId);
      if (!task) return path;

      path.push(taskId);

      const dependents = dependencies
        .filter(dep => dep.dependsOnTaskId === taskId)
        .map(dep => dep.taskId);

      let longestPath = path;
      for (const dependentId of dependents) {
        const newPath = calculateCriticalPath(dependentId, new Set(visited), [...path]);
        if (newPath.length > longestPath.length) {
          longestPath = newPath;
        }
      }

      return longestPath;
    };

    // Find critical path
    const rootTasks = tasks.filter(task => 
      !dependencies.some(dep => dep.taskId === task.id)
    );

    let criticalPath = [];
    for (const rootTask of rootTasks) {
      const path = calculateCriticalPath(rootTask.id);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        tasks: ganttTasks,
        milestones: Array.from(milestoneTaskIds),
        criticalPath,
        dependencies: dependencies.map(dep => ({
          id: dep.id,
          from: dep.dependsOnTaskId,
          to: dep.taskId,
          type: dep.type
        }))
      }
    });
  } catch (error) {
    logger.error('Get Gantt data error:', error);
    next(error);
  }
};

module.exports = {
  getGanttData
};




