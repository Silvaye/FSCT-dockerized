export function initUploader({ inputId, buttonId, spinnerId, listContainer, onSuccess }) {
    const fileInput = document.getElementById(inputId);
    const uploadButton = document.getElementById(buttonId);
    const loadingSpinner = document.getElementById(spinnerId);
  
    uploadButton.addEventListener('click', () => {
      const file = fileInput.files[0];
      if (!file) return alert('Please select a .las file.');
  
      loadingSpinner.style.display = 'inline';
      const formData = new FormData();
      formData.append('lasfile', file);
  
      fetch('/upload', {
        method: 'POST',
        body: formData
      })
        .then(res => res.json())
        .then(data => {
          loadingSpinner.style.display = 'none';
          if (data.success) onSuccess(data.uuid, data.filename);
          else alert('Upload failed: ' + data.error);
        })
        .catch(err => {
          loadingSpinner.style.display = 'none';
          alert('Upload error: ' + err.message);
        });
    });
  }
  
export function submitFile(uniqueId, filename, socket) {
    socket.emit('start_process', {
      uuid: uniqueId,
      filename: filename
    })
    console.log(`Submitting file for processing: ${uniqueId}/${filename}`);

  }