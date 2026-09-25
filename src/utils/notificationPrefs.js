// Backend notification types -> the preference keys shown in Settings > Notifications
const PREF_KEY = {
  task_assigned: 'task_assigned',
  task_mentioned: 'mention',
  mention: 'mention',
  task_comment: 'comment_added',
  task_status_changed: 'project_update',
  task_due_soon: 'task_due',
  task_overdue: 'task_overdue',
  project_member_added: 'member_joined',
  project_member_removed: 'member_joined',
  workspace_member_added: 'member_joined',
  invite_accepted: 'member_joined'
};

const PREF_KEYS = ['task_assigned', 'task_due', 'task_overdue', 'comment_added', 'mention', 'project_update', 'member_joined', 'budget_threshold'];

// A channel is on unless the user explicitly switched it off
const channelEnabled = (prefs, type, channel) => {
  const p = prefs && PREF_KEY[type] ? prefs[PREF_KEY[type]] : null;
  return !(p && p[channel] === false);
};

module.exports = { PREF_KEY, PREF_KEYS, channelEnabled };
