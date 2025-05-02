#taken in part from https://github.com/SmartForest-no/Point2tree

# NVIDIA-CUDA as base image
FROM nvidia/cuda:12.8.1-cudnn-devel-ubuntu20.04

# Set environment variables
ENV UBUNTU_VER=20.04
ENV CONDA_VER=latest
ENV OS_TYPE=x86_64
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME="/root"
ENV PATH="$HOME/miniconda/bin:$PATH"

# Install dependencies and Miniconda
SHELL ["/bin/bash", "-c"]
RUN apt update && apt install -y \
    curl \
    wget \
    gcc \
    bzip2 && \
    mkdir conda_installation && cd conda_installation && \
    curl -LO https://repo.anaconda.com/miniconda/Miniconda3-${CONDA_VER}-Linux-${OS_TYPE}.sh && \
    bash Miniconda3-${CONDA_VER}-Linux-${OS_TYPE}.sh -b -p $HOME/miniconda && \
    rm Miniconda3-${CONDA_VER}-Linux-${OS_TYPE}.sh && \
    $HOME/miniconda/bin/conda init && \
    $HOME/miniconda/bin/conda config --set auto_activate_base true && \
    $HOME/miniconda/bin/conda update -n base -c defaults conda && \
    $HOME/miniconda/bin/conda clean -ya

# Install dependencies
RUN conda install pytorch torchvision pytorch-cuda=12.8 pyg pytorch-cluster -c pytorch -c nvidia -c pyg -y

RUN pip install pandas matplotlib scikit-learn laspy hdbscan scikit-image scikit-spatial mdutils markdown flask flask-socketio eventlet GPUtil

# Set default environment and PATH
ENV CONDA_DEFAULT_ENV=FSCT
ENV PATH="$HOME/miniconda/envs/FSCT/bin:$PATH"

# Set out working dir
WORKDIR /forest_tool

# Copy the project files into the container
COPY . /forest_tool