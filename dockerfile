FROM ubuntu:jammy

RUN apt-get -y update

RUN apt-get -y install git curl build-essential jq wget

RUN curl -sL https://deb.nodesource.com/setup_18.x | bash -

RUN apt-get -y install nodejs

WORKDIR /app

RUN wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem

COPY ./package.json ./

RUN npm install -g yarn

RUN yarn install

COPY ./ ./

RUN yarn build

RUN mkdir ls

RUN echo "0" > /app/ls/receiveIndex

COPY entrypoint.sh /app/entrypoint.sh

ENTRYPOINT [ "/bin/bash", "/app/entrypoint.sh" ]