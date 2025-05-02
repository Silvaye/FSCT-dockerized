# Use older CUDA base image to ensure PYG compatibility - 
FROM nvidia/cuda:12.6.3-cudnn-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME="/root"

# Install base dependencies
SHELL ["/bin/bash", "-c"]
RUN apt update && apt install -y \
    curl \
    wget \
    gcc \
    python3 \
    python3-pip \
    python3-venv && \
    ln -s /usr/bin/python3 /usr/bin/python

# Install pip deps
# Install torch(CUDA 12.6 by default)
RUN pip install --break-system-packages torch torchvision torchaudio
RUN pip install --break-system-packages torch_geometric
RUN pip install --break-system-packages pyg_lib torch_scatter torch_sparse torch_cluster torch_spline_conv -f https://data.pyg.org/whl/torch-2.6.0+cu126.html
RUN pip install --break-system-packages pandas matplotlib scikit-learn laspy hdbscan scikit-image scikit-spatial mdutils markdown flask flask-socketio eventlet GPUtil

WORKDIR /forest_tool
COPY . /forest_tool