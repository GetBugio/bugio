// BugIO Frontend JavaScript

// Translations (injected from server via window.__translations)
const i18n = window.__translations || {};

// Get auth token from localStorage or cookie (fallback)
function getToken() {
  const lsToken = localStorage.getItem('token');
  if (lsToken) return lsToken;
  const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='));
  return match ? match.substring(6) : null;
}

// API helper
const api = {
  async request(method, url, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
    };

    // Add auth token if present
    const token = getToken();
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    return response.json();
  },

  get: (url) => api.request('GET', url),
  post: (url, data) => api.request('POST', url, data),
  patch: (url, data) => api.request('PATCH', url, data),
  delete: (url) => api.request('DELETE', url),
};

// Vote handling
async function handleVote(ticketId, action) {
  const token = getToken();
  if (!token) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    return;
  }

  try {
    let result;
    if (action === 'add') {
      result = await api.post(`/api/tickets/${ticketId}/vote`);
    } else {
      result = await api.delete(`/api/tickets/${ticketId}/vote`);
    }

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || i18n.voteFailed);
    }
  } catch (error) {
    console.error('Vote error:', error);
    alert(i18n.voteFailed);
  }
}

// Status change handling (admin)
async function handleStatusChange(ticketId, newStatus) {
  const token = getToken();
  if (!token) {
    window.location.href = '/login';
    return;
  }

  try {
    const result = await api.patch(`/api/tickets/${ticketId}/status`, { status: newStatus });

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || i18n.statusFailed);
    }
  } catch (error) {
    console.error('Status change error:', error);
    alert(i18n.statusFailed);
  }
}

// Comment submission
async function submitComment(event, ticketId) {
  event.preventDefault();

  const form = event.target;
  const content = form.content.value.trim();

  if (!content) {
    alert(i18n.enterComment);
    return;
  }

  const token = getToken();
  if (!token) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    return;
  }

  try {
    const result = await api.post(`/api/tickets/${ticketId}/comments`, { content });

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || i18n.commentFailed);
    }
  } catch (error) {
    console.error('Comment error:', error);
    alert(i18n.commentFailed);
  }
}

// Delete comment (admin)
async function deleteComment(ticketId, commentId) {
  if (!confirm(i18n.deleteCommentConfirm)) {
    return;
  }

  try {
    const result = await api.delete(`/api/tickets/${ticketId}/comments/${commentId}`);

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || i18n.deleteCommentFailed);
    }
  } catch (error) {
    console.error('Delete comment error:', error);
    alert(i18n.deleteCommentFailed);
  }
}

// Login form
async function handleLogin(event) {
  event.preventDefault();

  const form = event.target;
  const email = form.email.value;
  const password = form.password.value;

  try {
    const result = await api.post('/api/auth/login', { email, password });

    if (result.success && result.data && result.data.token) {
      localStorage.setItem('token', result.data.token);
      localStorage.setItem('user', JSON.stringify(result.data.user));
      document.cookie = `token=${result.data.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;

      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || '/';
      window.location.href = redirect;
    } else {
      showFormError(form, result.error || i18n.loginFailed);
    }
  } catch (error) {
    console.error('Login error:', error);
    showFormError(form, i18n.loginFailed);
  }
}

// Register form
async function handleRegister(event) {
  event.preventDefault();

  const form = event.target;
  const email = form.email.value;
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (password !== confirmPassword) {
    showFormError(form, i18n.passwordsMismatch);
    return;
  }

  try {
    const result = await api.post('/api/auth/register', { email, password });

    if (result.success) {
      const loginResult = await api.post('/api/auth/login', { email, password });

      if (loginResult.success && loginResult.data && loginResult.data.token) {
        localStorage.setItem('token', loginResult.data.token);
        localStorage.setItem('user', JSON.stringify(loginResult.data.user));
        document.cookie = `token=${loginResult.data.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
        window.location.href = '/';
      } else {
        window.location.href = '/login';
      }
    } else {
      showFormError(form, result.error || i18n.registerFailed);
    }
  } catch (error) {
    console.error('Register error:', error);
    showFormError(form, i18n.registerFailed);
  }
}

// Create ticket form
async function handleCreateTicket(event) {
  event.preventDefault();

  const form = event.target;
  const data = {
    title: form.title.value,
    description: form.description.value,
    tag: form.tag.value,
  };

  const emailField = form.email;
  if (emailField && emailField.value) {
    data.author_email = emailField.value;
  }

  try {
    const result = await api.post('/api/tickets', data);

    if (result.success && result.data) {
      window.location.href = `/ticket/${result.data.id}`;
    } else {
      showFormError(form, result.message || result.error || i18n.createTicketFailed);
    }
  } catch (error) {
    console.error('Create ticket error:', error);
    showFormError(form, i18n.createTicketFailed);
  }
}

// Show form error/success message
function showFormError(form, message) {
  const existing = form.querySelector('.alert-error');
  if (existing) existing.remove();

  const alert = document.createElement('div');
  alert.className = 'alert alert-error';
  alert.textContent = message;
  form.insertBefore(alert, form.firstChild);
}

function showFormSuccess(form, message) {
  const existing = form.querySelector('.alert-success');
  if (existing) existing.remove();
  const existingError = form.querySelector('.alert-error');
  if (existingError) existingError.remove();

  const alert = document.createElement('div');
  alert.className = 'alert alert-success';
  alert.textContent = message;
  form.insertBefore(alert, form.firstChild);
}

// Logout
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.cookie = 'token=; path=/; max-age=0';
  window.location.href = '/';
}

// Theme toggle
function setTheme(theme) {
  localStorage.setItem('theme', theme);
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    var meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', '#f8f8fa');
  } else {
    document.documentElement.classList.remove('light');
    var meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', '#0b0b0d');
  }
}

function getTheme() {
  return localStorage.getItem('theme') || 'dark';
}

function updateThemeLabels(theme) {
  document.querySelectorAll('.theme-toggle-label').forEach(el => {
    el.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  });
}

// Language switcher
function setLang(lang) {
  localStorage.setItem('lang', lang);
  document.cookie = 'lang=' + lang + '; path=/; max-age=' + (365 * 24 * 60 * 60) + '; SameSite=Lax';
  window.location.reload();
}

// Settings form handlers
async function handleChangePassword(event) {
  event.preventDefault();
  const form = event.target;

  const currentPassword = form.currentPassword.value;
  const newPassword = form.newPassword.value;
  const confirmNewPassword = form.confirmNewPassword.value;

  if (newPassword !== confirmNewPassword) {
    showFormError(form, i18n.newPasswordsMismatch);
    return;
  }

  if (newPassword.length < 4) {
    showFormError(form, i18n.passwordTooShort);
    return;
  }

  try {
    const result = await api.post('/api/auth/change-password', { currentPassword, newPassword });
    if (result.success) {
      showFormSuccess(form, i18n.passwordChanged);
      form.reset();
    } else {
      showFormError(form, result.error || i18n.passwordChangeFailed);
    }
  } catch (error) {
    showFormError(form, i18n.passwordChangeFailed);
  }
}

async function handleChangeEmail(event) {
  event.preventDefault();
  const form = event.target;

  const password = form.password.value;
  const newEmail = form.newEmail.value;

  try {
    const result = await api.post('/api/auth/change-email', { password, newEmail });
    if (result.success) {
      showFormSuccess(form, i18n.emailChanged);
      // Update stored user data
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      user.email = newEmail;
      localStorage.setItem('user', JSON.stringify(user));
      // Refresh page to update sidebar
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showFormError(form, result.error || i18n.emailChangeFailed);
    }
  } catch (error) {
    showFormError(form, i18n.emailChangeFailed);
  }
}

async function handleSystemSettings(event) {
  event.preventDefault();
  const form = event.target;

  try {
    const result = await api.patch('/api/settings', {
      system_name: form.system_name.value,
      logo_path: form.logo_path.value || '',
    });

    if (result.success) {
      showFormSuccess(form, i18n.settingsSaved);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showFormError(form, result.error || i18n.saveFailed);
    }
  } catch (error) {
    showFormError(form, i18n.saveFailed);
  }
}

async function handleThemeColors(event) {
  event.preventDefault();
  const form = event.target;

  try {
    const result = await api.patch('/api/settings', {
      primary_color: form.primary_color.value,
      secondary_color: form.secondary_color.value,
      success_color: form.success_color.value,
      warning_color: form.warning_color.value,
      error_color: form.error_color.value,
    });

    if (result.success) {
      showFormSuccess(form, i18n.colorsSaved);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showFormError(form, result.error || i18n.saveFailed);
    }
  } catch (error) {
    showFormError(form, i18n.saveFailed);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Handle logout (desktop sidebar + mobile bottom nav)
  document.querySelectorAll('#logout-btn, #logout-btn-mobile, #settings-logout-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  });

  // Theme toggles (settings page, sidebar, mobile header)
  document.querySelectorAll('#theme-toggle, #sidebar-theme-toggle, #mobile-theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = getTheme();
      const newTheme = current === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
      updateThemeLabels(newTheme);
    });
  });

  // Set initial theme label
  updateThemeLabels(getTheme());

  // Language switcher dropdowns
  document.querySelectorAll('.lang-switcher-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.parentElement.querySelector('.lang-dropdown');
      dropdown.classList.toggle('open');
    });
  });

  document.querySelectorAll('.lang-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setLang(opt.dataset.lang);
    });
  });

  // Close lang dropdown on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.lang-dropdown.open').forEach(d => d.classList.remove('open'));
  });

  // Color input live hex display
  document.querySelectorAll('.color-input-row input[type="color"]').forEach(input => {
    input.addEventListener('input', () => {
      const hex = input.parentElement.querySelector('.color-hex');
      if (hex) hex.textContent = input.value;
    });
  });

  // Reset colors button
  const resetColorsBtn = document.getElementById('reset-colors-btn');
  if (resetColorsBtn) {
    resetColorsBtn.addEventListener('click', async () => {
      if (!confirm(i18n.resetConfirm)) return;
      try {
        const result = await api.post('/api/settings/reset');
        if (result.success) {
          window.location.reload();
        }
      } catch (error) {
        console.error('Reset error:', error);
      }
    });
  }

  // Vote buttons on ticket detail page
  document.querySelectorAll('[data-action="vote"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ticketId = btn.dataset.ticketId;
      const hasVoted = btn.dataset.voted === 'true';
      handleVote(ticketId, hasVoted ? 'remove' : 'add');
    });
  });

  // Status change form
  document.querySelectorAll('form[data-action="status-change"]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleStatusChange(form.dataset.ticketId, form.status.value);
    });
  });

  // Comment form
  document.querySelectorAll('form[data-action="comment"]').forEach(form => {
    form.addEventListener('submit', (e) => {
      submitComment(e, form.dataset.ticketId);
    });
  });

  // Delete comment buttons
  document.querySelectorAll('[data-action="delete-comment"]').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteComment(btn.dataset.ticketId, btn.dataset.commentId);
    });
  });

  // Handle forms with data-form attribute
  document.querySelectorAll('form[data-form]').forEach(form => {
    const formType = form.dataset.form;

    switch (formType) {
      case 'login':
        form.addEventListener('submit', handleLogin);
        break;
      case 'register':
        form.addEventListener('submit', handleRegister);
        break;
      case 'create-ticket':
        form.addEventListener('submit', handleCreateTicket);
        break;
      case 'change-password':
        form.addEventListener('submit', handleChangePassword);
        break;
      case 'change-email':
        form.addEventListener('submit', handleChangeEmail);
        break;
      case 'system-settings':
        form.addEventListener('submit', handleSystemSettings);
        break;
      case 'theme-colors':
        form.addEventListener('submit', handleThemeColors);
        break;
    }
  });
});
