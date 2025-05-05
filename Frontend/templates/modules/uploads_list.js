export function fetchUploadsListing(renderCallback) {
    fetch('/list_uploads')
      .then(res => res.json())
      .then(data => renderCallback(data))
      .catch(err => renderCallback(null, err));
  }
  