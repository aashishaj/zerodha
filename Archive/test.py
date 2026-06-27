asteroids = [5,10,-5]
resul= []
#result = [5,10]
 
flag = 0

while flag == 0:
    tempList  = []
    ct = len(asteroids)
    for i in range(len(asteroids)):
        if i < ct:
            if asteroids[i] >= 0 and asteroids[i+1] > 0:
                tempList.append(asteroids[i])
            elif asteroids[i] >= 0 and asteroids[i+1] < 0:
                negnumber = asteroids[i+1] * -1
                if asteroids[i] > negnumber:
                    tempList.append(asteroids[i]) 
                elif asteroids[i] < negnumber:
                    tempList.append(asteroids[i+1])
                else:
                    continue
            elif asteroids[i] < 0 and asteroids[i+1] < 0:
                tempList.append(asteroids[i])
        else:
            exit
    
    result = tempList.copy()

print(result)       
