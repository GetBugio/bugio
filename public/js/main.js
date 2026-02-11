// BugIO Frontend JavaScript

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
    const token = localStorage.getItem('token');
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
  const token = localStorage.getItem('token');
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
      alert(result.error || 'Failed to update vote');
    }
  } catch (error) {
    console.error('Vote error:', error);
    alert('Failed to update vote');
  }
}

// Status change handling (admin)
async function handleStatusChange(ticketId, newStatus) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  try {
    const result = await api.patch(`/api/tickets/${ticketId}/status`, { status: newStatus });

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || 'Failed to update status');
    }
  } catch (error) {
    console.error('Status change error:', error);
    alert('Failed to update status');
  }
}

// Comment submission
async function submitComment(event, ticketId) {
  event.preventDefault();

  const form = event.target;
  const content = form.content.value.trim();

  if (!content) {
    alert('Please enter a comment');
    return;
  }

  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    return;
  }

  try {
    const result = await api.post(`/api/tickets/${ticketId}/comments`, { content });

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || 'Failed to add comment');
    }
  } catch (error) {
    console.error('Comment error:', error);
    alert('Failed to add comment');
  }
}

// Delete comment (admin)
async function deleteComment(ticketId, commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) {
    return;
  }

  try {
    const result = await api.delete(`/api/tickets/${ticketId}/comments/${commentId}`);

    if (result.success) {
      window.location.reload();
    } else {
      alert(result.error || 'Failed to delete comment');
    }
  } catch (error) {
    console.error('Delete comment error:', error);
    alert('Failed to delete comment');
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
      showFormError(form, result.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    showFormError(form, 'Login failed');
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
    showFormError(form, 'Passwords do not match');
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
      showFormError(form, result.error || 'Registration failed');
    }
  } catch (error) {
    console.error('Register error:', error);
    showFormError(form, 'Registration failed');
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
      showFormError(form, result.error || 'Failed to create ticket');
    }
  } catch (error) {
    console.error('Create ticket error:', error);
    showFormError(form, 'Failed to create ticket');
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

// Settings form handlers
async function handleChangePassword(event) {
  event.preventDefault();
  const form = event.target;

  const currentPassword = form.currentPassword.value;
  const newPassword = form.newPassword.value;
  const confirmNewPassword = form.confirmNewPassword.value;

  if (newPassword !== confirmNewPassword) {
    showFormError(form, 'Neue Passwoerter stimmen nicht ueberein');
    return;
  }

  if (newPassword.length < 4) {
    showFormError(form, 'Neues Passwort muss mindestens 4 Zeichen haben');
    return;
  }

  try {
    const result = await api.post('/api/auth/change-password', { currentPassword, newPassword });
    if (result.success) {
      showFormSuccess(form, 'Passwort erfolgreich geaendert');
      form.reset();
    } else {
      showFormError(form, result.error || 'Fehler beim Aendern des Passworts');
    }
  } catch (error) {
    showFormError(form, 'Fehler beim Aendern des Passworts');
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
      showFormSuccess(form, 'E-Mail erfolgreich geaendert');
      // Update stored user data
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      user.email = newEmail;
      localStorage.setItem('user', JSON.stringify(user));
      // Refresh page to update sidebar
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showFormError(form, result.error || 'Fehler beim Aendern der E-Mail');
    }
  } catch (error) {
    showFormError(form, 'Fehler beim Aendern der E-Mail');
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
      showFormSuccess(form, 'System-Einstellungen gespeichert');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showFormError(form, result.error || 'Fehler beim Speichern');
    }
  } catch (error) {
    showFormError(form, 'Fehler beim Speichern');
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
      showFormSuccess(form, 'Farben gespeichert');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showFormError(form, result.error || 'Fehler beim Speichern');
    }
  } catch (error) {
    showFormError(form, 'Fehler beim Speichern');
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
      if (!confirm('Alle Farben auf Standard zuruecksetzen?')) return;
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
