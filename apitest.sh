#!/bin/bash

node web.js &
SERVER_PID=$!
echo "Server has started, pid: $SERVER_PID"

STATUS=0
sleep 1

# Case 1: expecting 404
RESULT=$(curl -v 'http://localhost:5000/api/file/0/source' 2>&1 | grep -e '< HTTP/1.1')
RESULT=$(echo $RESULT | awk '{ print $3 }')
if [ "404" != "$RESULT" ]; then
    echo "!!! Error when case 1"
    STATUS=1
fi

# Case 2: expecting 200
RESULT=$(curl -X POST 'http://localhost:5000/api/insert' -d 'content=test1')
if [ "{\"ok\":true,\"payload\":{\"id\":0}}" != "$RESULT" ]; then
    echo "!!! Error when case 2"
    STATUS=1
fi

# Case 3: Getting data back
RESULT=$(curl 'http://localhost:5000/api/file/0/source')
if [ "{\"ok\":true,\"id\":\"0\",\"payload\":{\"source\":\"test1\"}}" != "$RESULT" ]; then
    echo "!!! Error when case 3"
    STATUS=1
fi

kill -INT $SERVER_PID
echo "Test done"
exit $STATUS
