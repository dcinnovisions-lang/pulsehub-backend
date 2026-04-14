const { TaskDependency, Task } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * @desc    Create task dependency
 * @route   POST /api/v1/tasks/:taskId/dependencies
 * @access  Private
 */
const createDependency = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { dependsOnTaskId, type = 'blocks' } = req.body;

    // Verify both tasks exist
    const task = await Task.findByPk(taskId);
    const dependsOnTask = await Task.findByPk(dependsOnTaskId);

    if (!task || !dependsOnTask) {
      return res.status(404).json({
        success: false,
        error: 'One or both tasks not found'
      });
    }

    // Prevent self-dependency
    if (taskId === dependsOnTaskId) {
      return res.status(400).json({
        success: false,
        error: 'Task cannot depend on itself'
      });
    }

    // Check for circular dependency
    const circularCheck = await checkCircularDependency(taskId, dependsOnTaskId);
    if (circularCheck) {
      return res.status(400).json({
        success: false,
        error: 'Circular dependency detected'
      });
    }

    // Check if dependency already exists
    const existing = await TaskDependency.findOne({
      where: {
        taskId,
        dependsOnTaskId
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Dependency already exists'
      });
    }

    const dependency = await TaskDependency.create({
      taskId,
      dependsOnTaskId,
      type
    });

    // Reload with associations
    await dependency.reload({
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title']
        },
        {
          model: Task,
          as: 'dependsOnTask',
          attributes: ['id', 'title']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: dependency
    });
  } catch (error) {
    logger.error('Create dependency error:', error);
    next(error);
  }
};

/**
 * @desc    Get task dependencies
 * @route   GET /api/v1/tasks/:taskId/dependencies
 * @access  Private
 */
const getDependencies = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { direction = 'both' } = req.query; // 'incoming', 'outgoing', or 'both'

    let dependencies = [];

    if (direction === 'incoming' || direction === 'both') {
      const incoming = await TaskDependency.findAll({
        where: { taskId },
        include: [
          {
            model: Task,
            as: 'dependsOnTask',
            attributes: ['id', 'title', 'statusId', 'priority']
          }
        ]
      });
      dependencies = dependencies.concat(incoming.map(dep => ({ ...dep.toJSON(), direction: 'incoming' })));
    }

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = await TaskDependency.findAll({
        where: { dependsOnTaskId: taskId },
        include: [
          {
            model: Task,
            as: 'task',
            attributes: ['id', 'title', 'statusId', 'priority']
          }
        ]
      });
      dependencies = dependencies.concat(outgoing.map(dep => ({ ...dep.toJSON(), direction: 'outgoing' })));
    }

    res.status(200).json({
      success: true,
      count: dependencies.length,
      data: dependencies
    });
  } catch (error) {
    logger.error('Get dependencies error:', error);
    next(error);
  }
};

/**
 * @desc    Delete task dependency
 * @route   DELETE /api/v1/tasks/:taskId/dependencies/:dependencyId
 * @access  Private
 */
const deleteDependency = async (req, res, next) => {
  try {
    const { taskId, dependencyId } = req.params;

    const dependency = await TaskDependency.findOne({
      where: {
        id: dependencyId,
        taskId
      }
    });

    if (!dependency) {
      return res.status(404).json({
        success: false,
        error: 'Dependency not found'
      });
    }

    await dependency.destroy();

    res.status(200).json({
      success: true,
      message: 'Dependency deleted successfully'
    });
  } catch (error) {
    logger.error('Delete dependency error:', error);
    next(error);
  }
};

/**
 * @desc    Get dependency chain/graph for visualization
 * @route   GET /api/v1/tasks/:taskId/dependency-graph
 * @access  Private
 */
const getDependencyGraph = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { depth = 3 } = req.query;

    const graph = await buildDependencyGraph(taskId, parseInt(depth));

    res.status(200).json({
      success: true,
      data: graph
    });
  } catch (error) {
    logger.error('Get dependency graph error:', error);
    next(error);
  }
};

/**
 * Helper function to check for circular dependencies
 */
const checkCircularDependency = async (taskId, dependsOnTaskId, visited = new Set()) => {
  if (taskId === dependsOnTaskId) {
    return true;
  }

  if (visited.has(dependsOnTaskId)) {
    return false; // Already checked this path
  }

  visited.add(dependsOnTaskId);

  // Get all tasks that the dependsOnTask depends on
  const dependencies = await TaskDependency.findAll({
    where: { taskId: dependsOnTaskId },
    attributes: ['dependsOnTaskId']
  });

  for (const dep of dependencies) {
    if (await checkCircularDependency(taskId, dep.dependsOnTaskId, visited)) {
      return true;
    }
  }

  return false;
};

/**
 * Helper function to build dependency graph
 */
const buildDependencyGraph = async (taskId, depth, currentDepth = 0, visited = new Set()) => {
  if (currentDepth >= depth || visited.has(taskId)) {
    return null;
  }

  visited.add(taskId);

  const task = await Task.findByPk(taskId, {
    attributes: ['id', 'title', 'statusId', 'priority']
  });

  if (!task) {
    return null;
  }

  const incoming = await TaskDependency.findAll({
    where: { taskId },
    include: [
      {
        model: Task,
        as: 'dependsOnTask',
        attributes: ['id', 'title', 'statusId', 'priority']
      }
    ]
  });

  const outgoing = await TaskDependency.findAll({
    where: { dependsOnTaskId: taskId },
    include: [
      {
        model: Task,
        as: 'task',
        attributes: ['id', 'title', 'statusId', 'priority']
      }
    ]
  });

  const node = {
    task: task.toJSON(),
    incoming: [],
    outgoing: []
  };

  for (const dep of incoming) {
    const childGraph = await buildDependencyGraph(
      dep.dependsOnTaskId,
      depth,
      currentDepth + 1,
      new Set(visited)
    );
    if (childGraph) {
      node.incoming.push({
        dependency: dep.toJSON(),
        node: childGraph
      });
    }
  }

  for (const dep of outgoing) {
    const childGraph = await buildDependencyGraph(
      dep.taskId,
      depth,
      currentDepth + 1,
      new Set(visited)
    );
    if (childGraph) {
      node.outgoing.push({
        dependency: dep.toJSON(),
        node: childGraph
      });
    }
  }

  return node;
};

module.exports = {
  createDependency,
  getDependencies,
  deleteDependency,
  getDependencyGraph
};


